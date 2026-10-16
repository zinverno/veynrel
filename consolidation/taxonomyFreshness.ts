import type { App } from "obsidian";

/** Explicit scan starts this dirty flag only. No scans, reads or requests in event handlers. */
export function watchTaxonomyFreshness(app: App, changed: () => void): () => void {
  const refs = [app.vault.on("create", changed), app.vault.on("modify", changed), app.vault.on("delete", changed), app.vault.on("rename", changed)];
  const cacheRefs = app.metadataCache ? [app.metadataCache.on("changed", changed), app.metadataCache.on("resolved", changed)] : [];
  return () => { refs.forEach(ref => app.vault.offref(ref)); cacheRefs.forEach(ref => app.metadataCache.offref(ref)); };
}
