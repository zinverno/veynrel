import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
vi.mock("obsidian", async () => {
  // Existing test dependency; the native suite separately checks Obsidian's parser and offsets.
  const yaml = await vi.importActual<{ load(s: string): unknown }>("js-yaml");
  return { parseYaml: (s: string) => yaml.load(s) };
});
import { assertSourceProperties, documentEnvelope, preserveDocument } from "./documentEnvelope";
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("exact source envelope", () => {
  it("replays the retained content-only A fixture without claiming a new model result", () => {
    const source = readFileSync(new URL("./evaluation/fixtures/A.source.md", import.meta.url), "utf8");
    const raw = readFileSync(new URL("./evaluation/fixtures/A.content.md", import.meta.url), "utf8");
    const result = preserveDocument(source, raw, "replace"), prefix = documentEnvelope(source).prefix;
    expect(result.after).toBe(raw); expect(hash(result.sourcePrefix)).toBe(hash(prefix));
    expect(result.separateBody.startsWith("---")).toBe(false); expect(result.proposedPrefix).toBe(prefix);
  });
  it.each(["\n", "\r\n"])("retains literal properties with %j, BOM, comments, anchors and multiline values", eol => {
    const prefix = '\uFEFF---\n# comment\nid: "0007"\naliases: &aliases [A, B]\ncopy: *aliases\ntext: |\n  line one\n  line two\n---\n'.split("\n").join(eol);
    const r = preserveDocument(prefix + "Original body", "---\nid: changed\n---\nNew body", "replace");
    expect(hash(r.after.slice(0, prefix.length))).toBe(hash(prefix)); expect(r.after).toBe(prefix + "New body");
    expect(r.proposedPrefix).toBe("---\nid: changed\n---\n"); expect(r.separateBody).toBe("New body");
    expect(() => assertSourceProperties(prefix + "Original body", r.after, "replace")).not.toThrow();
  });
  it("restores absent model properties, excludes additions and handles empty/EOF blocks", () => {
    expect(preserveDocument("---\n---\nOld", "New", "replace").after).toBe("---\n---\nNew");
    expect(preserveDocument("Old", "---\nid: proposed\n---\nNew", "replace").after).toBe("New");
    const old = "---\na: 2\n---", result = preserveDocument(old, "New", "replace").after;
    expect(result.startsWith(old)).toBe(true); expect(() => assertSourceProperties(old, result, "replace")).not.toThrow();
  });
  it("append preserves the whole source prefix and excludes response YAML", () => {
    const old = "---\nid: keep\n---\nSaved body\r\n", response = "---\naliases: unwanted\n---\nAddition";
    const r = preserveDocument(old, response, "append");
    expect(r.after).toBe(old + "\n\nAddition"); expect(r.separateBody).toBe("Saved body\r\n\n\nAddition");
    expect(hash(r.after.slice(0, old.length))).toBe(hash(old));
  });
  it.each(["---\na: 1", "--- \na: 1\n---", "---\na: 1\n...\nBody", "---\na: [\n---\nBody", "---\nordinary prose\n---\nBody", "\n---\na: 1\n---", "---\na: 1\n--- \nBody", "---\na: 1\r---\nBody"])("refuses ambiguous/unsupported prefix %j", raw => {
    expect(() => documentEnvelope(raw)).toThrow("frontmatter");
  });
  it.each(["# Heading\n---\na: text\n---", "```yaml\na: 1\n```", "Text\n---\nid: 3\n---", "***\nbody"])("does not turn body constructs into properties", raw => {
    expect(documentEnvelope(raw)).toMatchObject({ properties: false, body: raw, prefix: "" });
  });
  it("refuses property mutation or a new block even when a caller bypasses composition", () => {
    expect(() => assertSourceProperties("---\nid: A\n---\nbody", "---\nid: B\n---\nbody", "replace")).toThrow("frontmatter");
    expect(() => assertSourceProperties("body", "---\nid: B\n---\nbody", "replace")).toThrow("frontmatter");
  });
});
