import { describe, expect, it } from "vitest";
import { structureCoverage } from "./workbenchStructure";
import { deriveTopology } from "../topology/deriveTopology";
import type { LocalVaultSnapshot } from "../analyzers/local/types";
const input = (unknown = false): LocalVaultSnapshot => ({
  notes: ["Area/A.md", "Area/B.md", "Else/C.md"].map((path, i) => ({ path, basename: path.split("/")[1].replace(/\.md$/u, ""), mtime: 1,
    contentAvailable: false, linksAvailable: !(unknown && i === 2), resolvedOutgoing: i === 0 ? ["Area/B.md"] : [], unresolvedLinks: [] })),
  coverage: { noteListComplete: true, contentComplete: false, linksComplete: !unknown }, diagnostics: [], diagnosticsTruncated: 0,
});
describe("structural Workbench coverage", () => {
  it("counts scope separately and never classifies unknown metadata outside scope as isolation", async () => {
    const map = await deriveTopology(input(true), 1, new AbortController().signal);
    const view = structureCoverage({ state: "ready", map }, ["Area/B.md"]);
    expect(view).toEqual({ complete: false, unknown: 1, represented: 1, isolated: new Set() });
  });
  it("keeps orphan authority in the current whole-vault owner, including external incoming links", async () => {
    const map = await deriveTopology(input(), 1, new AbortController().signal);
    expect(structureCoverage({ state: "ready", map }, ["Area/B.md", "Else/C.md"]).isolated).toEqual(new Set(["Else/C.md"]));
    for (const state of ["stale", "loading", "error"] as const) expect(structureCoverage({ state, map }, ["Else/C.md"]).isolated.size).toBe(0);
  });
  it("absence of a snapshot is unknown rather than zero missing metadata", () => {
    expect(structureCoverage({ state: "idle" }, ["Area/A.md"])).toEqual({ complete: false, unknown: undefined, represented: 0, isolated: new Set() });
  });
});
