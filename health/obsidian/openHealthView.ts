import type { Workspace } from "obsidian";

export const VEYNREL_HEALTH_VIEW_TYPE = "veynrel-health";

/** Caller serializes simultaneous opens; revealLeaf handles DeferredView loading. */
export async function openHealthView(workspace: Pick<Workspace, "getLeavesOfType" | "getLeaf" | "revealLeaf">): Promise<void> {
  let leaf = workspace.getLeavesOfType(VEYNREL_HEALTH_VIEW_TYPE)[0];
  if (!leaf) {
    leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VEYNREL_HEALTH_VIEW_TYPE, active: true });
  }
  await workspace.revealLeaf(leaf);
}
