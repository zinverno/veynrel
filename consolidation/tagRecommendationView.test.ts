import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn() }));
import { setLanguage } from "../i18n";
import { renderTagRecommendationView } from "./tagRecommendationView";
import type { TagRecommendationSession } from "./tagRecommendationSession";
import type { TagRecommendations } from "./tagRecommendationContract";
import cases from "../tests/fixtures/tag-recommendations.json";
class Element {
  children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false;
  listeners = new Map<string, () => void>();
  empty() { this.children = []; }
  private create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) {
    const child = new Element(); child.tag = tag; child.text = opts.text ?? ""; child.attrs = opts.attr ?? {}; this.children.push(child); return child;
  }
  createEl(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) { return this.create(tag, opts); }
  createDiv(opts: { text?: string; attr?: Record<string, string> }) { return this.create("div", opts); }
  addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
}
describe("tag recommendation rendering", () => {
  it.each(["ru", "en"] as const)("renders %s existing/new/abstention outcomes as text, without implicit calls", language => {
    setLanguage(language); const container = new Element(), result = structuredClone(cases.find(c => c.name === "justified_new_tag")!.response) as TagRecommendations;
    result.categories[0].proposed[0].evidence.text = '<img src="https://example.invalid/tracker">';
    const session = { view: { stage: "result", result }, path: "One/Same.md", categoryName: () => "Тема", prepare: vi.fn(), confirm: vi.fn(), dismiss: vi.fn(), busy: false };
    renderTagRecommendationView(container as unknown as HTMLElement, session as unknown as TagRecommendationSession, vi.fn());
    const elements = container.all(); expect(elements.some(el => el.tag === "img")).toBe(false);
    expect(elements.some(el => el.text === '<img src="https://example.invalid/tracker">')).toBe(true);
    expect(elements.some(el => el.text === "#тема/кеширование")).toBe(true);
    expect(elements.some(el => el.text.startsWith("@"))).toBe(false);
    expect(session.prepare).not.toHaveBeenCalled(); expect(session.confirm).not.toHaveBeenCalled();
    elements.find(el => el.attrs["data-tag-rec-action"] === "dismiss")!.listeners.get("click")!(); expect(session.dismiss).toHaveBeenCalledOnce();
  });
  it("exposes the complete consent with explicit confirmation and disables selection while waiting", () => {
    setLanguage("en"); const container = new Element(), session = { view: { stage: "consent", consent: {
      provider: "Свой API", model: "fake", endpoint: "https://example.invalid/v1/chat/completions", characters: 10, tags: 2, excluded: 1, body: '{"source":"full text"}', bytes: 22,
    } }, path: "One/Same.md", confirm: vi.fn(), prepare: vi.fn(), cancel: vi.fn(), busy: false };
    renderTagRecommendationView(container as unknown as HTMLElement, session as unknown as TagRecommendationSession, vi.fn());
    expect(container.all().some(el => el.text.includes("Provider: Custom API"))).toBe(true);
    expect(container.all().find(el => el.tag === "pre")?.text).toBe(session.view.consent.body);
    expect(session.confirm).not.toHaveBeenCalled(); container.all().find(el => el.attrs["data-tag-rec-action"] === "confirm")!.listeners.get("click")!();
    expect(session.confirm).toHaveBeenCalledOnce(); session.busy = true; session.view.stage = "running";
    renderTagRecommendationView(container as unknown as HTMLElement, session as unknown as TagRecommendationSession, vi.fn());
    expect(container.all().find(el => el.attrs["data-tag-rec-action"] === "select")?.disabled).toBe(true);
  });
});
