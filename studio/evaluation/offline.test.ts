import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseDiagramSpec } from "../diagram/spec";
import { validateRecipe } from "../recipe";
import candidate from "./fixtures/meeting-structure-1.0.1.candidate.json";
import corpus from "./fixtures/paired-corpus.json";
import provenance from "./fixtures/provenance.json";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
describe("offline replay (not a new model evaluation)", () => {
  it("preserves exact minimal message.content/source bytes and provenance", () => {
    for (const file of provenance.files) expect(createHash("sha256").update(read(file.fixture)).digest("hex")).toBe(file.sha256);
  });
  it.each(["D", "E"])("retains %s: JSON syntax PASS, DiagramSpec FAIL; never repairs labels", name => {
    const raw = read(`${name}.content.json`), value = JSON.parse(raw) as { kind: "structure" | "flowchart"; edges: Record<string, unknown>[] };
    expect(value.edges).toHaveLength(4); expect(value.edges.every((edge: object) => !Object.prototype.hasOwnProperty.call(edge, "label"))).toBe(true);
    expect(() => parseDiagramSpec(raw, value.kind)).toThrow("spec"); expect(JSON.stringify(value)).not.toContain('"label":""');
  });
  it.each(["Да", "Yes", "Продолжить"])("accepts explicit synthetic branch labels (%s); rejects missing labels and dangling IDs", yes => {
    const graph = { schemaVersion: 1, kind: "flowchart" as const, title: "Synthetic decision",
      nodes: [{ id: "gate", label: "Ready?", shape: "diamond" }, { id: "go", label: "Continue", shape: "rectangle" }, { id: "wait", label: "Wait", shape: "ellipse" }],
      edges: [{ id: "a", from: "gate", to: "go", label: yes }, { id: "b", from: "gate", to: "wait", label: "Нет / No" }, { id: "c", from: "wait", to: "gate", label: "Check again" }] };
    expect(parseDiagramSpec(JSON.stringify(graph), "flowchart")).toEqual(graph);
    const { label: _label, ...missing } = graph.edges[0];
    for (const edge of [missing, { ...graph.edges[0], to: "absent" }, { ...graph.edges[0], extra: true }]) {
      expect(() => parseDiagramSpec(JSON.stringify({ ...graph, edges: [edge, ...graph.edges.slice(1)] }), "flowchart")).toThrow("spec");
    }
  });
  it("retains A as a blank-line-only diagnostic, not factual damage or a retry trigger", () => {
    const source = read("A.source.md"), output = read("A.content.md");
    const nonblank = (text: string) => text.split("\n").filter(line => line.trim()).join("\n");
    expect(source).not.toBe(output); expect(nonblank(source)).toBe(nonblank(output));
  });
  it("keeps the meeting candidate valid and outside the installed catalog/registry", () => {
    expect(validateRecipe(candidate)).toMatchObject({ id: "user.meeting-structure", version: "1.0.1", source: "user" });
  });
  it("keeps paired, varied reviewer expectations explicitly unevaluated", () => {
    expect(new Set(corpus.pairs.map(p => p.id)).size).toBe(corpus.pairs.length);
    for (const pair of corpus.pairs) {
      expect(pair.variants.length).toBeGreaterThanOrEqual(2); expect(new Set(pair.variants.map(v => v.input)).size).toBe(pair.variants.length);
      for (const variant of pair.variants) { expect(variant.criteria.length).toBeGreaterThan(0); expect(variant.modelQuality).toBe("NOT RE-EVALUATED"); }
    }
  });
});
