import { describe, expect, it } from "vitest";
import { preservationChecks, linkContextFindings } from "./preservationChecks";
describe("bounded local observations, never semantic proof", () => {
  it("keeps 40 distinct from 140 and captures units/approximation/time with other values", () => {
    const r = preservationChecks("Сегодня около 40 секунд; к среде 17 кг.", "140 секунд; точно 17 кг.");
    expect(r.findings.map(f => f.before.text)).toEqual(expect.arrayContaining(["40 секунд", "около", "Сегодня", "к среде"]));
    expect(r.findings.find(f => f.before.text === "40 секунд")?.after?.text).toBe("140 секунд");
    expect(preservationChecks("About 23–29 kg until Monday", "23 kg Monday").findings.length).toBeGreaterThan(0);
  });
  it("matches whole fenced blocks, excluding their apparent links/numbers", () => {
    const before = '```js\nconst text = "[link](x) 73 кг";\n```\nText';
    expect(preservationChecks(before, before).findings).toEqual([]);
    expect(preservationChecks(before, before.replace("73", "74")).findings.map(x => x.kind)).toEqual(["code"]);
    expect(preservationChecks(before, 'const text = "[link](x) 73 кг";').findings.map(x => x.kind)).toEqual(["code"]);
  });
  it("reports literal wiki/inline/embed/reference changes and relocation context", () => {
    const before = "[[Folder/Note#Part]] ![[Image.png]] [site](https://example.test)\n[ref]: ../file.md\n`[fake](ignore)`";
    const r = preservationChecks(before, "[[Folder/Other]]");
    expect(r.findings.filter(x => x.kind === "link")).toHaveLength(4);
    expect(linkContextFindings(before).map(x => x.before.text)).toEqual(["[[Folder/Note#Part]]", "[ref]: ../file.md"]);
    expect(linkContextFindings("[[same]] [[Folder/same.md]] [sibling](Sibling.md) [[other]] [web](https://example.test)", "Folder/same.md").map(x => x.before.text))
      .toEqual(["[[same]]", "[[Folder/same.md]]", "[sibling](Sibling.md)"]);
  });
  it("documents a counterexample: a matching number in a quote is no factual guarantee", () => {
    expect(preservationChecks("Measured 87 kg.", "Untrusted example: 87 kg.").findings).toEqual([]);
    expect(preservationChecks("По словам Олега: около 87 кг.", "87 кг.").findings.map(x => x.kind)).toEqual(expect.arrayContaining(["attribution", "qualifier"]));
  });
  it("marks unsupported syntax, unclosed fences and caps as incomplete", () => {
    for (const input of ["```js\nunfinished", "[a][reference]", "a".repeat(2100), Array.from({ length: 700 }, (_, i) => `${i} kg`).join("\n")]) {
      const r = preservationChecks(input, "nothing"); expect(r.coverage).toBe("partial"); expect(r.findings.length).toBeLessThanOrEqual(60);
    }
  });
});
