import { ensure, freeze, integer, object } from "../recipe";
import type { StudioStorage } from "../storage";
import { bytes, COMMUNITY_INDEX, COMMUNITY_LIMITS, parseCatalog, validateEntry, verifyRecipe } from "./schema";
import type { Catalog, CatalogEntry, CommunityPreview } from "./schema";
import { CommunityNetworkError } from "./transport";
import type { CommunityTransport } from "./transport";

export class CommunityCatalog {
  catalog?: Catalog;
  state: "idle" | "loading" | "ready" | "empty" | "cached" | "offline" | "error" = "idle";
  cacheWarning = false;
  fetchedAt = 0;
  private raw = "";
  private recipes = new Map<string, string>();
  private pending = false;
  private revision = 0;
  private cacheTail = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private readonly storage: StudioStorage, private readonly transport: CommunityTransport) {}
  subscribe(f: () => void): () => void { this.listeners.add(f); return () => this.listeners.delete(f); }
  private emit(): void { for (const f of this.listeners) f(); }
  private get path(): string { return `${this.storage.root}/community-cache.json`; }
  private async loadCache(): Promise<void> {
    if (this.catalog || !await this.storage.adapter.exists(this.path)) return;
    try {
      const raw = await this.storage.read(this.path, COMMUNITY_LIMITS.cache); ensure(bytes(raw) <= COMMUNITY_LIMITS.cache, "size");
      const v: unknown = JSON.parse(raw);
      ensure(object(v, ["schemaVersion", "index", "fetchedAt", "recipes"]) && v.schemaVersion === 1 && typeof v.index === "string" && integer(v.fetchedAt, 1, Date.now()) && Array.isArray(v.recipes) && v.recipes.length <= COMMUNITY_LIMITS.cachedRecipes, "storage");
      const catalog = parseCatalog(v.index), verified = new Map<string, string>();
      for (const row of v.recipes) {
        ensure(object(row, ["url", "raw"]) && typeof row.raw === "string", "storage");
        const e = catalog.entries.find(e => e.recipeUrl === row.url); ensure(e && !verified.has(e.recipeUrl), "storage");
        await verifyRecipe(e, row.raw); verified.set(e.recipeUrl, row.raw);
      }
      this.raw = v.index; this.catalog = catalog; this.fetchedAt = v.fetchedAt; this.recipes = verified; this.state = "cached";
    } catch { this.cacheWarning = true; }
  }
  private saveCache(): Promise<void> {
    const work = this.cacheTail.then(async () => {
      const raw = JSON.stringify({ schemaVersion: 1, index: this.raw, fetchedAt: this.fetchedAt, recipes: [...this.recipes].map(([url, raw]) => ({ url, raw })) });
      ensure(bytes(raw) <= COMMUNITY_LIMITS.cache, "size");
      try { await this.storage.mkdir(this.storage.root); await this.storage.adapter.write(this.path, raw); ensure(await this.storage.read(this.path, COMMUNITY_LIMITS.cache) === raw, "storage"); }
      catch { this.cacheWarning = true; }
    });
    this.cacheTail = work.catch(() => { this.cacheWarning = true; }); return this.cacheTail;
  }
  /** Called only by the explicit online-catalog/Refresh actions. */
  async refresh(): Promise<void> {
    if (this.pending) return; this.pending = true; this.revision++; this.state = "loading"; this.emit();
    try {
      await this.loadCache(); this.state = "loading";
      const raw = await this.transport.get(COMMUNITY_INDEX, COMMUNITY_LIMITS.index), catalog = parseCatalog(raw);
      // Revalidate retained bytes against the new index; a changed hash never reuses old content.
      const retained = new Map<string, string>();
      for (const e of catalog.entries) {
        const cached = this.recipes.get(e.recipeUrl); if (!cached) continue;
        try { await verifyRecipe(e, cached); retained.set(e.recipeUrl, cached); } catch { /* Discard invalid public cache. */ }
      }
      this.revision++; this.catalog = catalog; this.raw = raw; this.recipes = retained; this.fetchedAt = Date.now();
      this.state = catalog.entries.length ? "ready" : "empty"; await this.saveCache();
    } catch (e) { this.state = this.catalog ? "cached" : e instanceof CommunityNetworkError ? "offline" : "error"; }
    finally { this.pending = false; this.emit(); }
  }
  async preview(entry: CatalogEntry): Promise<CommunityPreview> {
    const e = validateEntry(entry), revision = this.revision;
    ensure(this.catalog?.entries.some(row => JSON.stringify(row) === JSON.stringify(e)), "stale");
    const cached = this.recipes.get(e.recipeUrl);
    if (cached) { const preview = await verifyRecipe(e, cached); ensure(revision === this.revision, "stale"); return preview; }
    const raw = await this.transport.get(e.recipeUrl, COMMUNITY_LIMITS.recipe), preview = await verifyRecipe(e, raw);
    ensure(revision === this.revision && this.catalog?.entries.some(row => JSON.stringify(row) === JSON.stringify(e)), "stale");
    this.recipes.set(e.recipeUrl, raw);
    while (this.recipes.size > COMMUNITY_LIMITS.cachedRecipes) this.recipes.delete([...this.recipes.keys()][0]);
    await this.saveCache(); return freeze(preview);
  }
}
