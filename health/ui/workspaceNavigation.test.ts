import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("styles.css", "utf8");
const rule = (selector: string): string => css.slice(css.indexOf(`\n${selector} {`)).split("}")[0];
const nav = ".veynrel-health-view .veynrel-findings-navigation";

describe("workspace presentation contract", () => {
  it("uses a flat scrolling rail, transparent buttons, short separators and an accent underline", () => {
    expect(rule(nav)).toContain("flex-wrap: nowrap;");
    expect(rule(nav)).toContain("overflow-x: auto;");
    expect(rule(nav)).toContain("width: 100%;");
    for (const selector of [nav, `${nav} button`, ".veynrel-topology-preview"]) {
      expect(rule(selector)).toContain("border: 0;");
      expect(rule(selector)).toContain("border-radius: 0;");
      expect(rule(selector)).toContain("background: transparent;");
    }
    expect(rule(nav)).toContain("border-bottom: 1px solid var(--background-modifier-border);");
    expect(rule(`${nav} button`)).toContain("flex: 1 0 auto;");
    expect(rule(`${nav} button`)).toContain("white-space: nowrap;");
    expect(rule(`${nav} button + button::before`)).toContain("border-inline-start:");
    expect(rule(`${nav} button:focus-visible`)).toContain("outline:");
    expect(css).toMatch(/\[aria-current="page"\],[^{]+\{[^}]*font-weight: var\(--font-semibold\);[^}]*box-shadow: inset 0 -2px var\(--interactive-accent\);/u);
    expect(css).not.toMatch(/findings-navigation[^{}]*\{[^}]*flex-(?:basis: \d+%|wrap: wrap)/u);
  });

  it("integrates the preview section while retaining the neutral map surface", () => {
    expect(rule(".veynrel-topology-preview")).toContain("border-bottom: 1px solid var(--background-modifier-border);");
    expect(rule(".veynrel-topology-svg")).toContain("background: var(--background-secondary);");
  });
});
