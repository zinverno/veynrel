import { relationshipWireFixture } from "../tests/relationshipWireFixture";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { requestUrl } from "obsidian";
import { callOpenRouter } from "../api";
import { setLanguage, t } from "../i18n";
import { mergeFixture, mergeNote } from "../tests/mergeFixture";
import { atomizationFixture } from "../tests/atomizationFixture";
import { groupFixture } from "../tests/groupFixture";
import { bundleFixture } from "../tests/contextBundleFixture";
import { ChangePlannerSession } from "./changePlannerSession";
import { ChangePlannerView } from "./changePlannerView";
import { RelationshipSession } from "./relationshipSession";
import { renderRelationshipView } from "./relationshipView";
import { validateRelationshipResponse } from "./relationshipContract";
import { recommendationIntent, combineCapabilities } from "./recommendationIntent";
import type { IntentSelection } from "./recommendationIntent";
import { paragraphRanges } from "./changePlan";
import { mergeHints } from "./mergePlan";

class Element {
  children: Element[] = []; tag = "div"; text = ""; attrs: Record<string, string> = {};
  value = ""; disabled = false; checked = false; hidden = false; open = false;
  listeners = new Map<string, () => void>();
  setText(value: string) { this.text = value; }
  empty() { this.children = []; } closest() { return null; } focus() {} addClass() {}
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  create(tag: string, opts: { text?: string; value?: string; attr?: Record<string, string> } = {}) {
    const child = new Element(); Object.assign(child, { tag, text: opts.text ?? "", value: opts.value ?? "", attrs: opts.attr ?? {} }); this.children.push(child); return child;
  }
  createEl(tag: string, opts = {}) { return this.create(tag, opts); }
  createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
  addEventListener(k: string, fn: () => void) { this.listeners.set(k, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
  contains(el: Element) { return this.all().includes(el); }
  querySelector() { return this.all().find(e => e.attrs.role === "status"); }
  click() { if (!this.disabled) this.listeners.get("click")?.(); }
  change(value: string) { this.value = value; this.listeners.get("change")?.(); }
  check() { this.checked = true; this.listeners.get("change")?.(); }
}
const html = (e: Element) => e as unknown as HTMLElement;
const field = (e: Element, name: string) => e.all().find(n => n.attrs["data-planner-field"] === name)!;
const action = (e: Element, attr: string, name: string) => e.all().find(n => n.attrs[attr] === name)!;
const text = (e: Element) => e.all().map(n => n.text).join("\n");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function route(actionName = "add_link", selection: IntentSelection = { origin: "primary" }) {
  const f = mergeFixture();
  const response = structuredClone(f.analysis.result);
  response.recommendation.action = actionName as typeof response.recommendation.action;
  response.alternatives = [{ action: actionName === "consider_merge" ? "add_link" : "consider_merge", reason: "Alternative, not permission.", evidence: response.recommendation.evidence }];
  const settings = { provider: "openrouter" as const, model: "deepseek/deepseek-v4-flash-0731", apiKey: "synthetic", baseUrl: "https://example.test/v1", temperature: 0, topK: 5 };
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const relationship = new RelationshipSession({ settings: { get: () => settings, subscribe: () => () => {} }, read: async () => f.pair,
    complete: (s, system, user, signal, options) => callOpenRouter(s, system, user, { ...options, signal }) });
  await relationship.prepare();
  const user = JSON.parse(relationship.view.consent!.body).messages[1].content;
  vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(relationshipWireFixture(response, user)) } }] }) } as never);
  await relationship.confirm();
  expect(relationship.view.stage).toBe("result");
  const analysis = relationship.analysisSource!, root = new Element(), result = new Element(), review = vi.fn(), merge = vi.fn();
  const session = new ChangePlannerSession({ analysis: () => relationship.analysisSource, read: async () => f.read });
  const start = (chosen: IntentSelection) => {
    new ChangePlannerView(html(root), session, analysis, review, undefined, merge, undefined, undefined, undefined, chosen);
    void session.prepare();
  };
  renderRelationshipView(html(result), relationship, start);
  const key = selection.origin === "primary" ? "primary" : selection.origin === "alternative" ? `alternative-${selection.index}` : selection.action;
  action(result, "data-intent-action", key).click();
  if (!["no_change", "manual_review"].includes(actionName)) await vi.waitFor(() => expect(session.view.stage).toBe("choosing"));
  return { ...f, analysis, relationship, session, root, result, review, merge, settings };
}

describe("validated transport response → intent → existing planner → exact review", () => {
  it.each(["ru", "en"] as const)("%s opens link directly and preserves family when direction changes", async language => {
    setLanguage(language); const f = await route();
    expect(field(f.root, "operation")).toBeUndefined(); expect(field(f.root, "source").value).toBe("");
    expect(text(f.root)).not.toContain(t("@planner.unsupported"));
    field(f.root, "source").change("0"); field(f.root, "range").change("0");
    expect(field(f.root, "confirm").checked).toBe(false);
    expect(action(f.root, "data-planner-action", "build").disabled).toBe(true);
    field(f.root, "confirm").check(); field(f.root, "source").change("1");
    expect(field(f.root, "range").value).toBe("");
    field(f.root, "range").change("0"); expect(field(f.root, "confirm").checked).toBe(false);
    field(f.root, "confirm").check(); action(f.root, "data-planner-action", "build").click();
    await vi.waitFor(() => expect(f.session.view.stage).toBe("ready"));
    const plan = f.session.view.plan!; expect(plan.operation).toBe("add_link"); expect(plan.sourcePath).toBe(f.pair[1].path);
    expect(plan.after).toContain(` [[${f.pair[0].path.slice(0, -3)}]]`);
    expect(f.root.all().find(e => e.attrs["data-planner-text"] === "after")!.text).toBe(plan.after);
    expect(f.review).not.toHaveBeenCalled(); action(f.root, "data-safe-action", "review").click(); expect(f.review).toHaveBeenCalledWith(plan);
    expect(requestUrl).toHaveBeenCalledTimes(1); expect(text(f.root)).not.toMatch(/@intent\./u);
  });
  it.each([{ origin: "primary" }, { origin: "alternative", index: 0 }, { origin: "user", action: "consider_merge" }] as IntentSelection[])("merge route keeps $origin provenance and requires all confirmations", async selection => {
    const f = await route(selection.origin === "primary" ? "consider_merge" : "add_link", selection);
    expect(field(f.root, "operation")).toBeUndefined(); expect(field(f.root, "combine-canonical").value).toBe("");
    field(f.root, "combine-canonical").change("0");
    const start = paragraphRanges(f.pair[1])[1].start;
    expect(field(f.root, `merge-transfer-${start}`).checked).toBe(false);
    expect(field(f.root, "merge-location").value).toBe("");
    field(f.root, `merge-transfer-${start}`).check(); field(f.root, "merge-location").change("0");
    expect(field(f.root, "merge-confirm").checked).toBe(false); field(f.root, "merge-confirm").check();
    action(f.root, "data-merge-action", "build").click(); await vi.waitFor(() => expect(f.session.view.stage).toBe("ready"));
    const plan = f.session.view.mergePlan!;
    expect(plan.secondary.content).toBe(f.pair[1].content); expect(plan.secondary.unchanged).toBe(true);
    expect(plan.provenance.recommendation).toEqual(f.analysis.result.recommendation);
    expect(f.root.all().find(e => e.attrs["data-intent-origin"])!.attrs["data-intent-origin"]).toBe(selection.origin);
    expect(f.root.all().find(e => e.attrs["data-merge-text"] === "after")!.text).toBe(plan.canonical.after);
    action(f.root, "data-merge-apply-action", "review").click(); expect(f.merge).toHaveBeenCalledExactlyOnceWith(plan);
    field(f.root, "combine-canonical").change("1"); expect(f.session.view.mergePlan).toBeUndefined();
    expect(field(f.root, "merge-location").value).toBe(""); expect(requestUrl).toHaveBeenCalledTimes(1);
  });
  it.each(["consider_embed_b_in_a", "consider_embed_a_in_b"])("%s carries the exact direction to the existing guarded builder", async actionName => {
    const f = await route(actionName), side = actionName === "consider_embed_b_in_a" ? 0 : 1;
    expect(field(f.root, "source").value).toBe(String(side)); expect(field(f.root, "source").disabled).toBe(true);
    field(f.root, "range").change("0"); field(f.root, "confirm").check(); action(f.root, "data-planner-action", "build").click();
    await vi.waitFor(() => expect(f.session.view.stage).toBe("ready"));
    expect(f.session.view.plan!.edit!.inserted).toBe(`![[${f.pair[1 - side].path.slice(0, -3)}]]`);
    f.pair[1 - side].references.push({ kind: "embed", original: "cycle", target: f.pair[side].path });
    expect(recommendationIntent(f.analysis, { origin: "primary" }, f.pair).limitations).toContain("@planner.error.cycle");
  });
  it.each(["no_change", "manual_review"])("%s never opens a planner", async name => {
    const f = await route(name); expect(f.session.view.stage).toBe("idle"); expect(f.root.all()).toHaveLength(1);
    expect(f.relationship.view.stage).toBe(name === "no_change" ? "dismissed" : "result");
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });
  it("close, settings changes and old result buttons cannot revive the analysis or late plan", async () => {
    const f = await route(); const old = action(f.result, "data-intent-action", "primary");
    f.session.close(); f.settings.model = "changed"; old.click();
    expect(f.relationship.analysisSource).toBeUndefined(); expect(f.session.view.plan).toBeUndefined(); expect(requestUrl).toHaveBeenCalledTimes(1);
  });
});

it("checks supported Group/Bundle capabilities without selecting or broadening material", () => {
  for (const [f, operation] of [[groupFixture(), "copy_context_group"], [bundleFixture(), "copy_context_bundle"]] as const) {
    f.analysis.result = validateRelationshipResponse(JSON.stringify(f.analysis.result), f.pair[0].content, f.pair[1].content);
    expect(combineCapabilities(f.analysis, f.pair, 0).find(c => c.operation === operation)?.reason).toBeUndefined();
    expect(recommendationIntent(f.analysis, { origin: "primary" }, f.pair).status).toBe("needs_input");
  }
});
it("refuses unsupported structure early from metadata, preserving all strict guards", async () => {
  const f = groupFixture();
  for (const note of f.pair) for (const section of note.cache!.sections!) if (section.type === "paragraph") section.type = "table";
  expect(recommendationIntent(f.analysis, { origin: "primary" }, f.pair).status).toBe("unavailable");
  const root = new Element(), session = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read });
  new ChangePlannerView(html(root), session, f.analysis, undefined, undefined, undefined, undefined, undefined, undefined, { origin: "primary" });
  await session.prepare(); field(root, "combine-canonical").change("0");
  expect(text(root)).toMatch(/No safe transfer|безопасный перенос/u);
  expect(root.all().some(e => e.attrs["data-merge-action"] === "build")).toBe(false);
});
it("quotes cannot authorize ranges and ambiguous quotes produce no hints", () => {
  const f = mergeFixture(), quote = f.analysis.result.claims[0].quoteA!;
  const repeat = mergeNote(f.pair[0].path, `${quote}\n\n${quote}\n`);
  expect(mergeHints(f.analysis.result, [repeat, f.pair[1]]).some(h => h.side === 0 && h.id === f.analysis.result.claims[0].id)).toBe(false);
  const intent = recommendationIntent(f.analysis, { origin: "primary" }, f.pair);
  expect(JSON.stringify(intent)).not.toMatch(/confirmed|contextReviewed|insertionConfirmed/u);
});
it("atomization requires actual standalone evidence and remains preview-only", () => {
  const f = mergeFixture(); f.analysis.result.recommendation.action = "consider_atomize";
  expect(recommendationIntent(f.analysis, { origin: "primary" }, f.pair).status).toBe("unavailable");
  f.analysis.result.claims[1].kind = "standalone_a";
  f.analysis.result = validateRelationshipResponse(JSON.stringify(f.analysis.result), f.pair[0].content, f.pair[1].content);
  const intent = recommendationIntent(f.analysis, { origin: "primary" }, f.pair);
  expect(intent.operation).toBe("atomization_preview"); expect(intent.status).toBe("needs_input"); expect(intent.direction).toBe(0);
});

it.each(["length", "bad-evidence"])("%s through the transport parser cannot offer any plan", async failure => {
  const f = mergeFixture(), result = structuredClone(f.analysis.result);

  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const session = new RelationshipSession({ settings: { get: () => ({ provider: "openrouter", model: "deepseek/deepseek-v4-flash-0731", apiKey: "synthetic", baseUrl: "https://example.test/v1", temperature: 0, topK: 5 }), subscribe: () => () => {} },
    read: async () => f.pair, complete: (s, system, user, signal, options) => callOpenRouter(s, system, user, { ...options, signal }) });
  await session.prepare();
  const wire = relationshipWireFixture(result, JSON.parse(session.view.consent!.body).messages[1].content);
  wire.claims[0].evidenceA = "unknown";
  vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: failure === "length" ? "length" : "stop", message: { content: JSON.stringify(wire) } }] }) } as never);
  await session.confirm();
  expect(session.view.error).toBe(failure === "length" ? "outputLimit" : "unverifiedEvidence"); expect(session.analysisSource).toBeUndefined();
  const root = new Element(), prepare = vi.fn(); renderRelationshipView(html(root), session, prepare);
  expect(root.all().some(e => e.attrs["data-intent-action"])).toBe(false); expect(prepare).not.toHaveBeenCalled(); expect(requestUrl).toHaveBeenCalledTimes(1);
});

it("uses the builder's exact protection and existing-link guards before showing ranges", () => {
  const f = mergeFixture();
  const a = mergeNote(f.pair[0].path, f.pair[0].content.replace(/\n\n/gu, "\n"));
  const pair = [a, f.pair[1]] as const;
  const analysis = { ...f.analysis, pair, result: validateRelationshipResponse(JSON.stringify({ ...f.analysis.result,
    recommendation: { ...f.analysis.result.recommendation, action: "consider_embed_b_in_a" } }), a.content, pair[1].content) };
  const embed = recommendationIntent(analysis, { origin: "primary" }, pair);
  expect(embed.status).toBe("unavailable"); expect(embed.limitations).toContain("@planner.error.protected");
  pair[0].references.push({ kind: "link", original: "existing", target: pair[1].path });
  pair[1].references.push({ kind: "link", original: "existing", target: pair[0].path });
  const link = recommendationIntent(analysis, { origin: "user", action: "add_link" }, pair);
  expect(link.status).toBe("unavailable"); expect(link.limitations).toContain("@planner.error.existing");
});

it("routes validated standalone evidence to an actual atomization preview without an Apply action", async () => {
  const f = atomizationFixture();
  f.analysis.result.claims.push({ id: "unit", kind: "standalone_a", text: "A standalone observation, subject to context review.", quoteA: f.pair[0].content, quoteB: null });
  f.analysis.result.recommendation = { action: "consider_atomize", reason: "Review this standalone observation.", evidence: ["unit"] };
  f.analysis.result = validateRelationshipResponse(JSON.stringify(f.analysis.result), f.pair[0].content, f.pair[1].content);
  const session = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read, atomizationObservation: async () => f.observation });
  const root = new Element(), review = vi.fn();
  new ChangePlannerView(html(root), session, f.analysis, review, undefined, undefined, undefined, undefined, undefined, { origin: "primary" });
  await session.prepare(); expect(field(root, "operation")).toBeUndefined();
  field(root, "atom-source").change("0"); field(root, "atom-selection").change("0");
  for (const [key, value] of [["title", f.choice.title], ["path", f.choice.path]]) {
    const input = field(root, `atom-${key}`); input.value = value; input.listeners.get("input")!();
  }
  for (const key of ["unitConfirmed", "contextConfirmed", "titleConfirmed", "sourceConfirmed", "dependenciesReviewed"]) {
    expect(field(root, `atom-${key}`).checked).toBe(false); field(root, `atom-${key}`).check();
  }
  action(root, "data-atom-action", "build").click(); await vi.waitFor(() => expect(session.view.atomizationPlan).toBeDefined());
  expect(root.all().find(e => e.attrs["data-atom-text"] === "preview")!.text).toBe(session.view.atomizationPlan!.destination.markdown);
  expect(root.all().some(e => e.attrs["data-safe-action"] || e.attrs["data-empty-atom-action"] === "review")).toBe(false);
  expect(review).not.toHaveBeenCalled(); expect(session.view.plan).toBeUndefined();
});
