import type { App } from "obsidian";

/** UI revocation until dispatch. Executors retain every check during and after their own writes. */
export class ReviewLifetime {
  private valid = true;
  private readonly cleanup: (() => void)[] = [];
  constructor(app: App, invalidate: () => void) {
    const revoke = () => { if (!this.valid) return; this.valid = false; this.stop(); invalidate(); };
    for (const ref of [app.vault.on("create", revoke), app.vault.on("modify", revoke), app.vault.on("delete", revoke), app.vault.on("rename", revoke)])
      this.cleanup.push(() => app.vault.offref(ref));
    for (const ref of [app.metadataCache.on("changed", revoke), app.metadataCache.on("resolved", revoke)])
      this.cleanup.push(() => app.metadataCache.offref(ref));
    for (const ref of [app.workspace.on("file-open", revoke), app.workspace.on("layout-change", revoke)])
      this.cleanup.push(() => app.workspace.offref(ref));
  }
  current(): boolean { return this.valid; }
  stop(): void { for (const off of this.cleanup.splice(0)) off(); }
  close(): void { this.valid = false; this.stop(); }
}
