import { vi } from "vitest";
import { appFixture } from "../../health/obsidian/testSupport";
import { RecallService } from "../services/recallService";
import { ObsidianRecallSource } from "../source/obsidianRecallSource";
import { ObsidianRecallStorage } from "../store/obsidianRecallStorage";
import { RecallRecovery } from "./recallRecovery";
import { RecallProductController } from "./recallProductController";

export const recallRoot = "Private/Config/plugins/ai-knowledge-hub/recall";
export const cardsPath = `${recallRoot}/cards.json`;
export function productFixture(raw?: string) {
  const f = appFixture(); let now = 100;
  Object.assign(f.note.stat, { size: 100 });
  f.vault.read.mockResolvedValue("## Flashcards\nQuestion::SECRET ANSWER");
  if (raw !== undefined) f.files.set(cardsPath, raw);
  const clock = () => now;
  const factory = vi.fn(() => new RecallService(new ObsidianRecallStorage(f.app.vault.adapter, f.vault.configDir, "ai-knowledge-hub"),
    new ObsidianRecallSource(f.app.vault), clock));
  const recovery = new RecallRecovery(f.adapter, f.vault.configDir, "ai-knowledge-hub", () => "test-backup");
  const open = vi.fn(async (_path: string) => true);
  const product = new RecallProductController(factory, recovery, open, clock);
  return { ...f, product, factory, recovery, open, time: (value: number) => { now = value; },
    service: () => factory.mock.results[factory.mock.results.length - 1].value as RecallService };
}
