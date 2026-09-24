import type { App, TFile } from "obsidian";

/** The existing Deep Audit scope, shared by legacy audit and Knowledge Health. */
export function collectDeepAuditFiles(app: App): TFile[] {
  return app.vault.getMarkdownFiles().filter((file) => {
    const path = file.path.toLowerCase();
    return !path.startsWith(app.vault.configDir.toLowerCase() + "/") &&
      !path.startsWith("templates/") && !path.startsWith(".ai-backup") && !file.basename.startsWith(".");
  });
}
