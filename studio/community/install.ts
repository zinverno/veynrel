import { ensure, freeze, integer, object, STUDIO_LIMITS, uuid, validateRecipe } from "../recipe";
import type { Recipe } from "../recipe";
import type { RecipeRegistry } from "../registry";
import type { StudioStorage } from "../storage";
import { verifyRecipe } from "./schema";
import type { CatalogEntry, CommunityPreview } from "./schema";

interface OriginRecord { schemaVersion: 1; sequence: number; entry: CatalogEntry; raw: string; localId: string }
export interface InstalledRecipe { entry: CatalogEntry; recipe: Recipe; baseline: Recipe; modified: boolean }
export class CommunityInstaller {
  state: "unloaded" | "ready" | "damaged" = "unloaded";
  private loaded?: Promise<void>;
  private origins = new Map<string, OriginRecord>();
  private sequence = 0;
  private busy = false;
  constructor(private readonly storage: StudioStorage, private readonly registry: RecipeRegistry) {}
  private get root(): string { return `${this.storage.root}/community-installs`; }
  private localRecipe(preview: CommunityPreview, id = `user.community.${preview.entry.id}`): Recipe {
    return validateRecipe({ ...preview.recipe, source: "user", id });
  }
  load(): Promise<void> {
    return this.loaded ??= (async () => {
      try {
        await this.registry.load();
        if (await this.storage.adapter.exists(this.root)) {
          const files = (await this.storage.adapter.list(this.root)).files; ensure(files.length <= 2000, "storage");
          const sequences = new Set<number>();
          for (const path of files.filter(p => p.endsWith(".json"))) {
            const name = path.slice(this.root.length + 1, -5);
            ensure(path === `${this.root}/${name}.json` && uuid(name), "storage");
            const v: unknown = JSON.parse(await this.storage.read(path, 160_000));
            ensure(object(v, ["schemaVersion", "sequence", "entry", "raw", "localId"]) && v.schemaVersion === 1 && integer(v.sequence, 1, 1000) && typeof v.raw === "string", "storage");
            const preview = await verifyRecipe(v.entry as CatalogEntry, v.raw);
            ensure(v.localId === `user.community.${preview.entry.id}` && !sequences.has(v.sequence), "storage"); sequences.add(v.sequence);
            ensure(await this.storage.adapter.exists(`${this.root}/${name}.done`) && await this.storage.read(`${this.root}/${name}.done`, 20) === "installed-v1", "storage");
            const record = v as unknown as OriginRecord, previous = this.origins.get(preview.entry.id);
            if (!previous || previous.sequence < record.sequence) this.origins.set(preview.entry.id, freeze(record));
            this.sequence = Math.max(this.sequence, record.sequence);
          }
          ensure(files.length === sequences.size * 2, "storage");
        }
        this.state = "ready";
      } catch { this.origins.clear(); this.state = "damaged"; }
    })();
  }
  installed(id: string): InstalledRecipe | undefined {
    const origin = this.origins.get(id); if (!origin) return;
    const recipe = this.registry.list().find(r => r.id === origin.localId); if (!recipe) return;
    const baseline = this.localRecipe({ entry: origin.entry, recipe: JSON.parse(origin.raw) as Recipe, raw: origin.raw }, origin.localId);
    return { entry: origin.entry, recipe, baseline, modified: JSON.stringify(recipe) !== JSON.stringify(baseline) };
  }
  provenance(localId: string): InstalledRecipe | undefined {
    for (const id of this.origins.keys()) { const result = this.installed(id); if (result?.recipe.id === localId) return result; }
  }
  /** expected binds consent to the exact local recipe shown in the preview. */
  async install(preview: CommunityPreview, expected: Recipe | undefined, mode: "replace" | "keep-copy"): Promise<Recipe> {
    ensure(!this.busy, "busy"); this.busy = true;
    try {
      await this.load(); ensure(this.state === "ready" && this.registry.state === "ready", "storage");
      const verified = await verifyRecipe(preview.entry, preview.raw), next = this.localRecipe(verified);
      const current = this.registry.list().find(r => r.id === next.id), installed = this.installed(verified.entry.id);
      ensure(JSON.stringify(current) === JSON.stringify(expected) && (!current || installed), "conflict");
      if (current && JSON.stringify(current) === JSON.stringify(next) && installed?.entry.sha256 === verified.entry.sha256) return current;
      const needsSlot = !current || installed?.modified && mode === "keep-copy";
      ensure(!needsSlot || this.registry.list().filter(r => r.source === "user").length < STUDIO_LIMITS.recipes, "size");
      ensure(this.sequence < 1000, "storage");
      const name = crypto.randomUUID(), record: OriginRecord = { schemaVersion: 1, sequence: this.sequence + 1, entry: verified.entry, raw: verified.raw, localId: next.id };
      try {
        await this.storage.create(`${this.root}/${name}.json`, JSON.stringify(record));
        if (current && installed?.modified && mode === "keep-copy") await this.registry.add(this.registry.duplicate(current));
        if (current) await this.registry.edit(next, current); else await this.registry.add(next);
        await this.storage.create(`${this.root}/${name}.done`, "installed-v1");
        this.sequence = record.sequence; this.origins.set(record.entry.id, freeze(record));
      } catch (e) { this.state = "damaged"; throw e; }
      return next;
    } finally { this.busy = false; }
  }
}
