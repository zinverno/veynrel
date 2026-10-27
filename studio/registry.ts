import { BUILTIN_RECIPES } from "./builtins";
import { ensure, freeze, object, parseRecipe, STUDIO_LIMITS, StudioError, validateRecipe } from "./recipe";
import type { Recipe } from "./recipe";
import { StudioStorage } from "./storage";

function parseStore(raw: string): readonly Recipe[] {
  ensure(raw.length <= 3_000_000, "storage"); const value: unknown = JSON.parse(raw);
  ensure(object(value, ["schemaVersion", "recipes"]) && value.schemaVersion === 1 && Array.isArray(value.recipes) && value.recipes.length <= STUDIO_LIMITS.recipes, "storage");
  const recipes = value.recipes.map(validateRecipe);
  ensure(recipes.every(r => r.source === "user") && new Set(recipes.map(r => r.id)).size === recipes.length, "storage"); return freeze(recipes);
}
export class RecipeRegistry {
  private recipes: readonly Recipe[] = [];
  private raw: string | null = null;
  private loaded?: Promise<void>;
  private tail = Promise.resolve();
  private listeners = new Set<() => void>();
  state: "unloaded" | "ready" | "damaged" = "unloaded";
  readonly path: string;
  constructor(private readonly storage: StudioStorage) { this.path = `${storage.root}/recipes.json`; }
  list(): readonly Recipe[] { return [...BUILTIN_RECIPES, ...this.recipes]; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { for (const f of this.listeners) { try { f(); } catch { /* Views cannot fail a committed registry write. */ } } }
  load(): Promise<void> {
    return this.loaded ??= (async () => {
      try {
        this.raw = await this.storage.adapter.exists(this.path) ? await this.storage.read(this.path, 3_000_000) : null;
        // A missing primary with backups may be an interrupted rename, never an empty library.
        if (this.raw === null && await this.storage.adapter.exists(`${this.storage.root}/recipe-backups`)) throw new StudioError("storage");
        this.recipes = this.raw === null ? [] : parseStore(this.raw); this.state = "ready";
      } catch { this.state = "damaged"; }
    })();
  }
  export(recipe: Recipe): string { return JSON.stringify(validateRecipe(recipe), null, 2); }
  import(raw: string): Promise<void> { return this.add(parseRecipe(raw)); }
  add(recipe: Recipe): Promise<void> {
    const next = validateRecipe(recipe); ensure(next.source === "user", "recipe");
    return this.update(rows => { ensure(!rows.some(r => r.id === next.id), "conflict"); return [...rows, next]; });
  }
  edit(recipe: Recipe, expected: Recipe): Promise<void> {
    const next = validateRecipe(recipe); ensure(next.source === "user" && next.id === expected.id, "recipe");
    return this.update(rows => { ensure(rows.some(r => JSON.stringify(r) === JSON.stringify(expected)), "conflict"); return rows.map(r => r.id === next.id ? next : r); });
  }
  remove(expected: Recipe): Promise<void> {
    ensure(expected.source === "user", "recipe");
    return this.update(rows => { ensure(rows.some(r => JSON.stringify(r) === JSON.stringify(expected)), "conflict"); return rows.filter(r => r.id !== expected.id); });
  }
  duplicate(recipe: Recipe): Recipe {
    return validateRecipe({ ...recipe, id: `user.${crypto.randomUUID()}`, source: "user", version: "1.0.0" });
  }
  private update(change: (rows: readonly Recipe[]) => readonly Recipe[]): Promise<void> {
    const result = this.tail.then(async () => {
      await this.load(); ensure(this.state === "ready", "storage");
      const next = JSON.stringify({ schemaVersion: 1, recipes: change(this.recipes) }); const parsed = parseStore(next);
      try { await this.replace(next, this.raw); this.raw = next; this.recipes = parsed; }
      catch { this.state = "damaged"; throw new StudioError("storage"); }
    });
    this.tail = result.catch(() => {}); return result.finally(() => this.emit());
  }
  private async replace(next: string, expected: string | null): Promise<void> {
    const s = this.storage, current = await s.adapter.exists(this.path) ? await s.read(this.path) : null;
    ensure(current === expected, "storage");
    const staging = `${s.root}/recipe-stage-${crypto.randomUUID()}.json`;
    await s.create(staging, next);
    // Keep every displaced original, including damaged bytes, for manual diagnosis.
    if (current !== null) {
      const backup = `${s.root}/recipe-backups/${crypto.randomUUID()}.json`;
      await s.create(backup, current);
      ensure(await s.read(this.path) === current, "storage");
      await s.adapter.rename(this.path, `${s.root}/recipe-original-${crypto.randomUUID()}.json`);
    } else ensure(!await s.adapter.exists(this.path), "storage");
    await s.adapter.rename(staging, this.path); ensure(await s.read(this.path) === next, "storage");
  }
  async backups(): Promise<{ path: string; recipes: readonly Recipe[] }[]> {
    const dir = `${this.storage.root}/recipe-backups`;
    if (!await this.storage.adapter.exists(dir)) return [];
    const rows: { path: string; recipes: readonly Recipe[] }[] = [];
    for (const path of (await this.storage.adapter.list(dir)).files) {
      if (!path.startsWith(`${dir}/`) || path.slice(dir.length + 1).includes("/")) continue;
      try { rows.push({ path, recipes: parseStore(await this.storage.read(path)) }); } catch { /* Preserve invalid backups; never load them. */ }
    }
    return rows;
  }
  recover(path: string): Promise<void> {
    const result = this.tail.then(async () => {
      ensure(this.state === "damaged", "storage");
      const backup = (await this.backups()).find(r => r.path === path); ensure(backup, "storage");
      const current = await this.storage.adapter.exists(this.path) ? await this.storage.read(this.path) : null;
      const next = JSON.stringify({ schemaVersion: 1, recipes: backup.recipes });
      await this.replace(next, current); this.raw = next; this.recipes = backup.recipes; this.state = "ready";
    });
    this.tail = result.catch(() => {}); return result.finally(() => this.emit());
  }
}
