import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("styles.css", "utf8");
const rule = (selector: string): string => css.slice(css.indexOf(`\n${selector} {`)).split("}")[0];
const nav = ".veynrel-health-view .veynrel-findings-navigation";

describe("workspace presentation contract", () => {
  it("shares one wide responsive shell, with bounded prose and an out-of-layout live region", () => {
    const shell = rule(".veynrel-health-view .veynrel-workspace");
    expect(shell).toContain("width: 100%;");
    expect(shell).toContain("padding: 0;");
    expect(rule(".veynrel-health-view .veynrel-shell")).toContain("grid-template-columns: 208px minmax(0, 1fr)");
    expect(rule(".veynrel-health-view .veynrel-shell-main")).toContain("max-width: 1536px");
    expect(css).toContain("max-width: 80ch;");
    expect(css).not.toMatch(/max-width: (?:880|1120)px/u);
    const live = rule(".veynrel-health-view .veynrel-health-status");
    for (const declaration of ["position: absolute;", "width: 1px;", "height: 1px;", "opacity: 0;", "pointer-events: none;", "overflow: hidden;"])
      expect(live).toContain(declaration);
    expect(live).not.toMatch(/display:\s*none|visibility:\s*hidden/u);
    expect(css).not.toContain(".veynrel-health-status:empty");
  });
  it("replaces the rail with one sidebar, a narrow pane menu and an explicit selected marker", () => {
    expect(css).not.toContain(nav);
    expect(rule(".veynrel-health-view .veynrel-sidebar nav")).toContain("flex-direction: column");
    expect(rule('.veynrel-health-view .veynrel-sidebar button[aria-current="page"]')).toContain("border-left-color:");
    expect(css).toContain("@container (max-width: 760px)");
    expect(css).toContain('[data-menu-open="true"] .veynrel-sidebar { display: block; }');
    expect(css).toContain("grid-template-columns: minmax(0, 1.85fr) minmax(268px, 1fr)");
    expect(css).toContain("@container (max-width: 600px)");
    expect(css).toContain(".veynrel-topic-node { position: relative; left: auto; top: auto; transform: none;");
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
