import { expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en" }));
import { setLanguage } from "../i18n";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { atomizationFixture } from "../tests/atomizationFixture";
class Element {
  children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false; hidden = false; checked = false; value = "";
  listeners = new Map<string, () => void>();
  empty() { this.children = []; } setText(text: string) { this.text = text; }
  create(tag: string, opts: { text?: string; attr?: Record<string, string>; value?: string } = {}) {
    const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; e.value = opts.value ?? ""; this.children.push(e); return e;
  }
  createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
  addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
}
it.each(["ru", "en"] as const)("%s: exact preview, separate confirmations, no Apply, reset and reopen", async language => {
  setLanguage(language); const f = atomizationFixture(), root = new Element(), apply = vi.fn();
  const s = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read, atomizationObservation: async () => f.observation });
  new ChangePlannerView(root as unknown as HTMLElement, s, f.analysis, apply, apply, apply, apply, apply); await s.prepare();
  const field = (key: string) => root.all().find(e => e.attrs["data-planner-field"] === key)!;
  const change = (key: string, value: string, event = "change") => { const e = field(key); e.value = value; e.listeners.get(event)!(); };
  const check = (key: string) => { const e = field("atom-" + key); e.checked = true; e.listeners.get("change")!(); };
  const action = (key: string) => root.all().find(e => e.attrs["data-atom-action"] === key)!;
  change("operation", "atomization_preview"); expect(root.all().filter(e => e.tag === "input").every(e => !e.checked)).toBe(true);
  change("atom-source", "0"); change("atom-selection", "0"); change("atom-title", f.choice.title, "input"); change("atom-path", f.choice.path, "input");
  for (const key of ["unitConfirmed", "contextConfirmed", "titleConfirmed", "sourceConfirmed", "dependenciesReviewed"]) check(key);
  expect(action("build").disabled).toBe(true); check("manualConfirmed"); expect(action("build").disabled).toBe(false);
  action("build").listeners.get("click")!(); await vi.waitFor(() => expect(s.view.stage).toBe("ready"));
  expect(root.all().find(e => e.attrs["data-atom-text"] === "preview")!.text).toBe(s.view.atomizationPlan!.destination.markdown);
  expect(root.all().find(e => e.attrs["data-atom-text"] === "remaining")!.text).toBe(f.pair[0].content);
  expect(root.all().find(e => e.attrs["data-atom-text"] === "original")!.text).toBe(f.pair[0].content);
  expect(root.all().some(e => /^@(atom|planner)\./u.test(e.text))).toBe(false);
  expect(root.all().some(e => e.attrs["data-safe-action"] || e.attrs["data-group-apply-action"] || e.attrs["data-bundle-apply-action"])).toBe(false); expect(apply).not.toHaveBeenCalled();
  change("atom-path", "Atoms/Changed.md", "input"); expect(s.view.atomizationPlan).toBeUndefined();
  expect(root.all().filter(e => e.tag === "input").every(e => !e.checked)).toBe(true);
  check("contextConfirmed"); change("atom-selection", "0"); expect(field("atom-contextConfirmed").checked).toBe(false);
  action("cancel").listeners.get("click")!(); expect(s.view.stage).toBe("cancelled");
  root.all().find(e => e.attrs["data-planner-action"] === "prepare")!.listeners.get("click")!();
  await vi.waitFor(() => expect(s.view.stage).toBe("choosing")); change("operation", "atomization_preview");
  expect(field("atom-source").value).toBe(""); expect(field("atom-title").value).toBe(""); expect(field("atom-path").value).toBe("");
});
