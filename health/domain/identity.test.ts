import { describe, expect, it } from "vitest";
import { stableHash } from "../../utils/stableHash";
import { stableHash as legacyHash } from "../../chunking/hash";
import { canonicalFindingPaths, createFindingFingerprint, findingIdFromFingerprint } from "./identity";
import { isVaultPath } from "./validation";

const input = { source: "semantic", analyzerId: "duplicates", dimension: "connections", type: "semantic-duplicate", paths: ["Notes/B.md", "Notes/A.md"] } as const;

describe("Health identity", () => {
  it("uses explicit technical fields and a canonical unordered path set", () => {
    const fingerprint = createFindingFingerprint(input);
    expect(fingerprint).toBe('v1:["semantic","duplicates","connections","semantic-duplicate",["Notes/A.md","Notes/B.md"],null]');
    expect(createFindingFingerprint({ ...input, paths: ["Notes/A.md", "Notes/B.md", "Notes/A.md"] })).toBe(fingerprint);
    expect(createFindingFingerprint({ ...input, type: "related" })).not.toBe(fingerprint);
    expect(createFindingFingerprint({ ...input, title: "Localized", explanation: "Другой язык" } as typeof input)).toBe(fingerprint);
    expect(canonicalFindingPaths(input.paths)).toEqual(["Notes/A.md", "Notes/B.md"]);
  });

  it("uses the unchanged shared hash and stable IDs", () => {
    expect(stableHash).toBe(legacyHash);
    expect(stableHash("Привет 😀")).toBe("209c243cc27a9835");
    const fp = createFindingFingerprint(input);
    expect(findingIdFromFingerprint(fp)).toBe(findingIdFromFingerprint(fp));
    expect(findingIdFromFingerprint(fp)).not.toBe(findingIdFromFingerprint(createFindingFingerprint({ ...input, type: "related" })));
    expect(() => findingIdFromFingerprint("")).toThrow();
  });

  it("separates directed technical discriminators and delimiter-containing paths", () => {
    expect(createFindingFingerprint({ ...input, key: "A->B" })).not.toBe(createFindingFingerprint({ ...input, key: "B->A" }));
    expect(createFindingFingerprint({ ...input, paths: ['Notes/A,"B.md'] })).not.toBe(createFindingFingerprint(input));
  });

  it.each(["", " ", "/etc/passwd", "C:/a.md", "C:a.md", "a\\b.md", "a/../b.md", "../a.md", "a//b.md", "a/./b.md", "a/", "a\0.md", "a\n.md", " a.md", "a/ b.md"])("rejects unsafe path %j", (path) => {
    expect(isVaultPath(path)).toBe(false);
    expect(() => createFindingFingerprint({ ...input, paths: [path] })).toThrow();
  });

  it("preserves case and Unicode and supports non-Markdown targets", () => {
    expect(isVaultPath("Notes/Тест 😀.md")).toBe(true);
    expect(isVaultPath("Attachments/image.png")).toBe(true);
    expect(createFindingFingerprint({ ...input, paths: ["A.md"] })).not.toBe(createFindingFingerprint({ ...input, paths: ["a.md"] }));
  });
});
