import { getAllTags } from "obsidian";
import type { App } from "obsidian";
import { taxonomyToken } from "./taxonomyProfile";
import type { TaxonomyProfilePort } from "./taxonomyProfile";
import type { WorkbenchTagsPort, WorkbenchTagSnapshot } from "../health/workbench/workbenchTags";

/** Obsidian owns parsing; modification invalidates membership until its matching cache event. */
export function createWorkbenchMetadata(app: App, paths: readonly string[], taxonomy: TaxonomyProfilePort): WorkbenchTagsPort {
  const included = new Set(paths), stale = new Set<string>(), listeners = new Set<() => void>();
  let revision = 0, snapshot: WorkbenchTagSnapshot | undefined, disposed = false;
  const changed = (): void => { revision++; snapshot = undefined; for (const listener of listeners) listener(); };
  const vaultRefs = [app.vault.on("modify", file => { if (included.has(file.path)) { stale.add(file.path); changed(); } }),
    app.vault.on("delete", file => { if (included.has(file.path)) { stale.add(file.path); changed(); } }),
    app.vault.on("rename", (file, old) => { if (included.has(old) || included.has(file.path)) { stale.add(old); stale.add(file.path); changed(); } })];
  const cacheRef = app.metadataCache.on("changed", file => { if (included.has(file.path)) { stale.delete(file.path); changed(); } });
  const removeProfile = taxonomy.subscribe(changed);
  return {
    refresh: () => { if(!disposed)changed(); },
    getSnapshot: () => snapshot ??= { revision, categories: taxonomy.get()?.categories ?? [], notes: paths.map(path => {
      try {
        const file = app.vault.getFileByPath(path), cache = file && app.metadataCache.getFileCache(file);
        if (!file || file.path !== path || !cache) return { path, state: "unknown", tags: [] };
        const raw = getAllTags(cache) ?? [];
        const tags = [...new Set(raw.map(tag => tag.startsWith("#") ? tag.slice(1) : tag))];
        if (tags.length > 10000 || tags.some(tag => !taxonomyToken(tag) || tag.split("/").length > 32)) return { path, state: "unknown", tags: [] };
        return { path, state: stale.has(path) ? "stale" : "known", tags };
      } catch { return { path, state: "unknown", tags: [] }; }
    }) },
    subscribe: listener => { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { disposed = true; vaultRefs.forEach(ref => app.vault.offref(ref)); app.metadataCache.offref(cacheRef); removeProfile(); listeners.clear(); },
  };
}
