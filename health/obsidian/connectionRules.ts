import type { Plugin } from "obsidian";
import { ConnectionRules } from "../connections/connectionRules";
import { healthStorageRoot } from "../store/healthStorage";

/** A separate small state file; settings, pair decisions and operation journals are untouched. */
export function createConnectionRules(plugin: Plugin): ConnectionRules {
  const { vault } = plugin.app, adapter = vault.adapter;
  const path = healthStorageRoot(vault.configDir, plugin.manifest.id).replace(/\/health$/u, "/connection-rules.json");
  const store = new ConnectionRules({
    read: async () => await adapter.exists(path) ? adapter.read(path) : await adapter.exists(`${path}.bak`) ? adapter.read(`${path}.bak`) : null,
    write: async text => {
      await adapter.write(`${path}.tmp`, text);
      if (await adapter.exists(path)) {
        if (await adapter.exists(`${path}.bak`)) await adapter.remove(`${path}.bak`);
        await adapter.rename(path, `${path}.bak`);
      }
      try { await adapter.rename(`${path}.tmp`, path); }
      catch (error) {
        try { if (!await adapter.exists(path) && await adapter.exists(`${path}.bak`)) await adapter.rename(`${path}.bak`, path); }
        catch { /* Load the previous backup if rollback could not restore its name. */ }
        throw error;
      }
    },
  }, async path => {
    const folder = vault.getFolderByPath(path);
    if (!folder || folder.path !== path) return null;
    const stat = await adapter.stat(path);
    if (!stat || stat.type !== "folder") return null;
    if (!Number.isSafeInteger(stat.ctime) || stat.ctime <= 0) throw Error("Folder identity unavailable");
    return stat.ctime;
  });
  const invalidate = (): void => { store.invalidateFolders(); };
  const refs = [vault.on("rename", file => { if ("children" in file) invalidate(); }),
    vault.on("delete", file => { if ("children" in file) invalidate(); }),
    vault.on("create", file => { if ("children" in file) invalidate(); })];
  plugin.register(() => refs.forEach(ref => vault.offref(ref)));
  return store;
}
