import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateRecipe } from "../recipe";
import candidate from "./fixtures/meeting-structure-1.0.1.candidate.json";
import corpus from "./fixtures/paired-corpus.json";
import provenance from "./fixtures/provenance.json";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
describe("offline replay (not a new model evaluation)", () => {
  it("preserves exact minimal message.content/source bytes and provenance", () => {
    for (const file of provenance.files) expect(createHash("sha256").update(read(file.fixture)).digest("hex")).toBe(file.sha256);
  });
  it.each(["D", "E"])("retains %s: historical diagram bytes with missing labels; never repairs them", name => {
    const raw = read(`${name}.content.json`), value = JSON.parse(raw) as { kind: "structure" | "flowchart"; edges: Record<string, unknown>[] };
    expect(value.edges).toHaveLength(4); expect(value.edges.every((edge: object) => !Object.prototype.hasOwnProperty.call(edge, "label"))).toBe(true);
    expect(JSON.stringify(value)).not.toContain('"label":""');
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
