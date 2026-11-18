import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("styles.css", "utf8");
const rule = (selector: string): string => css.slice(css.indexOf(`\n${selector} {`)).split("}")[0];

describe("workspace presentation contract", () => {
  it("shares one wide responsive shell, with bounded prose and an out-of-layout live region", () => {
    const shell = rule(".veynrel-health-view .veynrel-workspace");
    expect(shell).toContain("width: 100%;");
    expect(shell).toContain("padding: 0;");
    expect(rule(".veynrel-health-view .veynrel-shell")).toContain("display: block");
    expect(rule(".veynrel-health-view .veynrel-shell-main")).toContain("max-width: 1536px");
    expect(css).toContain("max-width: 80ch;");
    expect(css).not.toMatch(/max-width: (?:880|1120)px/u);
    const live = rule(".veynrel-health-view .veynrel-health-status");
    for (const declaration of ["position: absolute;", "width: 1px;", "height: 1px;", "opacity: 0;", "pointer-events: none;", "overflow: hidden;"])
      expect(live).toContain(declaration);
    expect(live).not.toMatch(/display:\s*none|visibility:\s*hidden/u);
    expect(css).not.toContain(".veynrel-health-status:empty");
  });
  it("uses Overview links and a return without global tabs or a sidebar", () => {
    const shell = readFileSync("health/workspace/renderWorkspaceShell.ts", "utf8");
    expect(shell).not.toMatch(/veynrel-brand|veynrel-sidebar|veynrel-tabs|createEl\("aside"/u);
    expect(shell).toContain('"← " + t("@workspace.home")');
    expect(shell).toContain('setIcon(summary, "settings")');
    expect(css).toContain('"batch check semantic"');
    expect(css).toContain('"tools check recall"');
  });

  it("integrates the preview section while retaining the neutral map surface", () => {
    expect(rule(".veynrel-topology-preview")).toContain("border-bottom: 1px solid var(--background-modifier-border);");
    expect(rule(".veynrel-topology-svg")).toContain("background: var(--background-secondary);");
  });
  it("shares theme-owned presentation and disables nonessential motion throughout the workspace", () => {
    const shared = css.split("/* Shared workspace presentation")[1];
    expect(shared.match(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu)).toBeNull();
    expect(rule(".view-content.veynrel-health-view")).toContain("--vx-bg: var(--veynrel-background);");
    expect(rule(".view-content.veynrel-health-view")).toContain("--vx-surface: var(--veynrel-surface);");
    expect(css).not.toContain(".theme-dark .veynrel-health-view {");
    expect(css).not.toContain("--studio-focus: var(--color-purple)");
    expect(css).not.toMatch(/clip-path|column-gap|!important/u);
    expect(css).not.toMatch(/\.veynrel-(?:workspace|topology-detail|neighborhood|neighborhood-card|global-map)\s+\*/u);
    for (const selector of [".veynrel-health-page-enter", ".veynrel-topology-content", ".veynrel-topology-inspector-content",
      ".veynrel-health-view .veynrel-core-geometry", ".veynrel-topology-detail :is(button, input, summary)", ".veynrel-neighborhood-list button",
      ".ai-hub-provider-card", ".ai-hub-model-chip", ".ai-hub-test-btn"])
      expect(css.split("@media (prefers-reduced-motion: reduce)").slice(1).some((block) => block.split("\n}")[0].includes(selector))).toBe(true);
    expect(shared).toContain(".veynrel-semantic-exploration, .veynrel-connect-overview { grid-template-columns: minmax(0, 1fr); }");
    expect(shared).toContain(".veynrel-connections-overview { grid-template-columns: minmax(0, 1fr);");
    expect(css).not.toContain(".veynrel-findings-row-explanation");
  });
});
