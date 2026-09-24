import { describe, expect, it, vi } from "vitest";
import { productFixture, cardsPath, recallRoot } from "./testSupport";
import { gate } from "../testSupport";
import { createRecallCandidate } from "../domain/identity";

async function discovered() {
  const f = productFixture(); await f.product.initialize(); await f.product.refreshCards(); return f;
}

describe("Recall product ownership and lazy inventory", () => {
  it("does zero IO on construction/snapshot/subscription and only metadata IO on single-flight initialization", async () => {
    const f = productFixture(), listener = vi.fn(), remove = f.product.subscribe(listener);
    expect(f.product.getSnapshot().loadState).toBe("uninitialized"); expect(f.factory).not.toHaveBeenCalled();
    expect(f.adapter.exists).not.toHaveBeenCalled();
    await Promise.all([f.product.initialize(), f.product.initialize()]);
    expect(f.factory).toHaveBeenCalledTimes(1); expect(f.adapter.exists.mock.calls).toEqual([[cardsPath]]);
    expect(f.adapter.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", firstRun: true, summary: { due: 0 } });
    expect(listener).toHaveBeenCalled(); remove();
    await f.product.refreshCards(); expect(f.product.getSnapshot()).toMatchObject({ firstRun: false, summary: { due: 1, new: 1 }, inventoryResult: { complete: true } });
    expect(f.factory).toHaveBeenCalledTimes(1); expect(f.vault.read).toHaveBeenCalledTimes(1);
  });

  it("single-flights refresh, preserves partial inventory and isolates all other persisted data", async () => {
    const f = await discovered();
    for (const path of ["health/findings.json", "health/scan-runs.json", "semantic/index.json", "data.json"]) f.files.set(path, `PRIVATE:${path}`);
    const others = [...f.files].filter(([path]) => path !== cardsPath);
    const entered = gate(), hold = gate(); f.time(200);
    f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; throw new Error("PRIVATE"); });
    const scan = f.product.refreshCards(); await entered.promise;
    expect(f.product.getSnapshot().refreshing).toBe(true); await f.product.refreshCards();
    hold.release(); await scan;
    expect(f.product.getSnapshot()).toMatchObject({ refreshing: false, summary: { active: 1 }, inventoryResult: { complete: false } });
    f.product.startSession(); f.product.revealAnswer(); await f.product.rate("good");
    expect([...f.files].filter(([path]) => path !== cardsPath)).toEqual(others);
    expect(f.adapter.write.mock.calls.every(([path]) => path === cardsPath)).toBe(true);
    expect(JSON.stringify(f.product.getSnapshot())).not.toContain("PRIVATE");
  });
});

describe("Recall transient review sessions", () => {
  it("omits answers until reveal and captures one timestamp for preview and delayed commit", async () => {
    const f = await discovered(), service = f.service(); f.product.startSession();
    expect(JSON.stringify(f.product.getSnapshot())).not.toContain("SECRET ANSWER");
    await f.product.rate("good"); expect(f.adapter.write).toHaveBeenCalledTimes(1);
    f.time(200); const preview = vi.spyOn(service, "previewCard"), review = vi.spyOn(service, "reviewCard");
    f.product.revealAnswer(); f.product.revealAnswer();
    const snapshot = f.product.getSnapshot(), id = snapshot.session!.card!.id;
    expect(preview).toHaveBeenCalledExactlyOnceWith(id, 200);
    expect(snapshot.session?.card?.answer).toBe("SECRET ANSWER");
    const expected = service.previewCard(id, 200).good;
    f.time(20_000); await f.product.rate("good");
    expect(review).toHaveBeenCalledExactlyOnceWith(id, "good", 200);
    expect(service.getCard(id)?.schedule).toEqual(expected.schedule);
    expect(f.product.getSnapshot().session).toMatchObject({ reviewed: 1, complete: true, revealed: false });
    expect(f.product.getSnapshot().nextDueAt).toBe(expected.schedule.dueAt);
  });

  it.each(["good", "easy"] as const)("rapid Good + %s commits/advances once and ignores refresh during session", async (second) => {
    const f = await discovered(); f.product.startSession(); f.time(200); f.product.revealAnswer();
    const entered = gate(), hold = gate(), write = f.adapter.write;
    f.adapter.write = vi.fn(async (path, raw) => { entered.release(); await hold.promise; await write(path, raw); });
    const first = f.product.rate("good"); await entered.promise;
    expect(f.product.getSnapshot()).toMatchObject({ reviewSaving: true, session: { reviewed: 0, revealed: true } });
    await f.product.rate(second); await f.product.refreshCards();
    expect(f.adapter.write).toHaveBeenCalledTimes(1); expect(f.vault.read).toHaveBeenCalledTimes(1);
    hold.release(); await first; expect(f.product.getSnapshot().session?.reviewed).toBe(1);
  });

  it("keeps the same revealed card/count after failed persistence, then exposes safe recovery", async () => {
    const f = await discovered(); f.product.startSession(); f.time(200); f.product.revealAnswer();
    const card = f.product.getSnapshot().session!.card, bytes = f.files.get(cardsPath);
    f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE disk exception")); await f.product.rate("good");
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "unavailable", reviewSaving: false, error: "review", canRecover: true,
      session: { card, reviewed: 0, revealed: true, complete: false } });
    expect(f.files.get(cardsPath)).toBe(bytes); expect(JSON.stringify(f.product.getSnapshot())).not.toContain("PRIVATE");
  });

  it("allows retry of a safe pre-write failure while preserving reveal/decision time", async () => {
    const f = await discovered(); f.product.startSession(); f.time(200); f.product.revealAnswer();
    const review = vi.spyOn(f.service(), "reviewCard").mockRejectedValueOnce(new Error("PRIVATE validation error"));
    await f.product.rate("good"); expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", error: "review", session: { revealed: true, reviewed: 0 } });
    f.time(300); await f.product.rate("good"); expect(review.mock.calls.map((call) => call[2])).toEqual([200, 200]);
    expect(f.product.getSnapshot().session?.reviewed).toBe(1);
  });

  it.each(["success", "failure"])("leaving an in-flight %s discards session and never restores it", async (result) => {
    const f = await discovered(); f.product.startSession(); f.time(200); f.product.revealAnswer();
    const entered = gate(), hold = gate(), write = f.adapter.write;
    f.adapter.write = vi.fn(async (path, raw) => { entered.release(); await hold.promise; if (result === "failure") throw new Error("PRIVATE"); await write(path, raw); });
    const pending = f.product.rate("easy"); await entered.promise; f.product.endSession();
    expect(f.product.getSnapshot().session).toBeUndefined(); f.product.startSession(); expect(f.product.getSnapshot().session).toBeUndefined();
    hold.release(); await pending;
    expect(f.product.getSnapshot().session).toBeUndefined(); expect(f.product.getSnapshot().error).toBeUndefined();
    expect(f.service().listCards()[0].schedule.reviewCount).toBe(result === "success" ? 1 : 0);
  });

  it("serves only due active cards, allows learning recurrence at due time and preserves retired memory", async () => {
    const f = await discovered(); f.time(200); f.product.startSession(); f.product.revealAnswer(); await f.product.rate("again");
    expect(f.product.getSnapshot()).toMatchObject({ session: { complete: true, reviewed: 1 }, summary: { due: 0 }, nextDueAt: 60_200 });
    f.product.endSession(); f.time(60_199); f.product.startSession(); expect(f.product.getSnapshot().session?.complete).toBe(true);
    f.product.endSession(); f.time(60_200); f.product.startSession(); expect(f.product.getSnapshot().session?.card).toBeDefined();
    const memory = f.service().listCards()[0].schedule;
    f.product.endSession(); f.vault.read.mockResolvedValue("No cards"); await f.product.refreshCards();
    expect(f.product.getSnapshot().summary?.due).toBe(0); expect(f.product.getSnapshot().nextDueAt).toBeUndefined();
    f.vault.read.mockResolvedValue("## Flashcards\nQuestion::SECRET ANSWER"); await f.product.refreshCards();
    expect(f.service().listCards()[0].schedule).toEqual(memory); expect(f.product.getSnapshot().summary?.due).toBe(1);
  });

  it("asks a fresh queue at each transition so another learning card can re-enter a long session", async () => {
    const f = productFixture(); f.vault.read.mockResolvedValue("## Flashcards\nOne::A\nTwo::B");
    await f.product.initialize(); await f.product.refreshCards(); f.product.startSession();
    const firstId = f.product.getSnapshot().session!.card!.id;
    f.time(200); f.product.revealAnswer(); await f.product.rate("again");
    expect(f.product.getSnapshot().session?.card?.id).not.toBe(firstId);
    f.time(70_000); f.product.revealAnswer(); await f.product.rate("easy");
    expect(f.product.getSnapshot().session).toMatchObject({ reviewed: 2, complete: false, card: { id: firstId } });
  });

  it("copies public snapshots and isolates subscriber failures from durable results", async () => {
    const f = await discovered(); f.product.subscribe(() => { throw new Error("View failed"); });
    f.product.startSession(); f.time(200); f.product.revealAnswer(); const snapshot = f.product.getSnapshot();
    Object.assign(snapshot.session!.card!, { question: "Tampered" }); Object.assign(snapshot.session!.previews![0], { intervalMs: 1 });
    expect(f.product.getSnapshot().session?.card?.question).toBe("Question");
    expect(f.product.getSnapshot().session?.previews?.[0].intervalMs).toBe(60000);
    await f.product.rate("good"); expect(f.product.getSnapshot().session?.reviewed).toBe(1);
  });

  it("source-note failure is safe and does not prevent review", async () => {
    const f = await discovered(); f.product.startSession(); f.open.mockResolvedValueOnce(false);
    await f.product.openSourceNote(); expect(f.product.getSnapshot().error).toBe("source");
    f.time(200); f.product.revealAnswer(); await f.product.rate("good"); expect(f.product.getSnapshot().session?.reviewed).toBe(1);
  });
});

describe("Recall product recovery and migrated inventory", () => {
  it.each(["{PRIVATE damaged", '{"version":99}', '{"version":2,"cards":{"x":{"schedule":{"algorithm":"future"}}}}'])("requires separate confirmation, preserves exact bytes, creates an empty owner without scanning: %s", async (raw) => {
    const f = productFixture(raw); await f.product.initialize();
    expect(f.product.getSnapshot().canRecover).toBe(true); await f.product.recoverStorage();
    expect(f.adapter.rename).not.toHaveBeenCalled();
    f.product.requestRecovery(); f.product.cancelRecovery(); await f.product.recoverStorage(); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.product.requestRecovery(); await f.product.recoverStorage();
    expect(f.files.get(`${recallRoot}/recovery/cards-test-backup.recovery.json`)).toBe(raw); expect(f.files.has(cardsPath)).toBe(false);
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", firstRun: true, summary: { active: 0 } });
    expect(f.factory).toHaveBeenCalledTimes(2); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it("recovery failure keeps the original owner and bytes blocked", async () => {
    const f = productFixture("{broken"); await f.product.initialize(); f.adapter.rename.mockRejectedValueOnce(new Error("PRIVATE"));
    f.product.requestRecovery(); await f.product.recoverStorage();
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "invalid", error: "recovery", recovering: false });
    expect(f.files.get(cardsPath)).toBe("{broken"); expect(f.factory).toHaveBeenCalledTimes(1);
    await f.product.refreshCards(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
  });

  it("offers retry only when metadata is unavailable, and hides reset if backup cannot be attempted", async () => {
    const f = productFixture(); f.adapter.exists.mockRejectedValue(new Error("PRIVATE")); await f.product.initialize();
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "unavailable", canRecover: false });
    f.adapter.exists.mockImplementation(async (path) => f.files.has(path) || f.folders.has(path));
    await f.product.retryLoad(); expect(f.product.getSnapshot()).toMatchObject({ loadState: "ready", firstRun: true });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it("loads v1 as due/new with no migration write and writes v3 on the first rating", async () => {
    const card = createRecallCandidate({ path: "A.md", question: "Old Q", answer: "Old A" });
    const f = productFixture(JSON.stringify({ version: 1, updatedAt: 10, cards: { [card.id]: { ...card, firstSeenAt: 10, lastSeenAt: 10, state: "active" } } }));
    await f.product.initialize(); expect(f.product.getSnapshot().summary).toMatchObject({ due: 1, new: 1 });
    expect(f.product.getSnapshot().inventoryEstablished).toBe(false);
    expect(f.adapter.write).not.toHaveBeenCalled(); f.product.startSession(); f.product.revealAnswer(); await f.product.rate("easy");
    expect(JSON.parse(f.files.get(cardsPath)!) as unknown).toMatchObject({ version: 3 });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
});
