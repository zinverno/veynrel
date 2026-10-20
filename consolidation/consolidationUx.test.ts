import { describe, expect, it, vi } from "vitest";

const dom = vi.hoisted(() => {
  const document: { activeElement?: Element } = {};
  class Element {
    closest() { return null; }
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; cls = "";
    value = ""; disabled = false; checked = false; open = false; parentElement?: Element; ownerDocument = document;
    listeners = new Map<string, () => void>();
    empty() { this.children = []; this.text = ""; }
    addClass(...names: string[]) { this.cls += ` ${names.join(" ")}`; }
    setText(text: string) { this.text = text; }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    getAttribute(key: string) { return this.attrs[key] ?? null; }
    create(tag: string, options: { text?: string; attr?: Record<string, string>; cls?: string; value?: string } = {}) {
      const el = new Element(); el.tag = tag; el.text = options.text ?? ""; el.attrs = options.attr ?? {}; el.cls = options.cls ?? ""; el.value = options.value ?? "";
      el.parentElement = this; this.children.push(el); return el;
    }
    createEl(tag: string, options = {}) { return this.create(tag, options); }
    createDiv(options = {}) { return this.create("div", options); }
    createSpan(options = {}) { return this.create("span", options); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    matches(selector: string): boolean {
      return selector.split(",").some(part => {
        const value = part.trim(), match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/u.exec(value);
        return match ? this.attrs[match[1]] !== undefined && (match[2] === undefined || this.attrs[match[1]] === match[2]) : this.tag === value;
      });
    }
    querySelector(selector: string) { return this.all().slice(1).find(el => el.matches(selector)); }
    querySelectorAll(selector: string) { return this.all().slice(1).filter(el => el.matches(selector)); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) this.listeners.get("click")?.(); }
    change(value?: string) { if (value !== undefined) this.value = value; this.listeners.get("change")?.(); }
  }
  const modals: Modal[] = [];
  class Modal {
    contentEl = new Element(); titleEl = new Element(); modalEl = new Element(); opened = false;
    constructor(readonly app: unknown) { modals.push(this); }
    onOpen() {} onClose() {}
    open() { this.opened = true; this.onOpen(); }
    close() { this.opened = false; this.onClose(); }
  }
  return { Element, Modal, modals, document };
});
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Test-only native YAML substitute.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { setIcon: vi.fn(), Modal: dom.Modal, TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", parseYaml: (s: string) => yaml.load(s),
    parseLinktext: (s: string) => ({ path: s.split("#")[0], subpath: s.includes("#") ? s.slice(s.indexOf("#")) : "" }) };
});

import { setLanguage } from "../i18n";
import { renderRelationshipView } from "./relationshipView";
import type { RelationshipSession } from "./relationshipSession";
import { renderActionChoice } from "./consolidationActions";
import { groupHistory, renderConsolidationHistory } from "./consolidationHistory";
import type { HistoryPresentation } from "./consolidationHistory";
import { ReviewLifetime } from "./reviewLifetime";
import { OperationHistoryModal, SafeApplyModal } from "./safeApplyModal";
import { ArchivePlannerModalV2 } from "./archivePlannerModalV2";
import type { ArchivePlanV2 } from "./archivePlanV2";
import type { SafeApplyService } from "./safeApply";
import { structuralArchiveFixture } from "../tests/structuralArchiveFixture";
import { archiveApplyFixture } from "../tests/archiveApplyFixture";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { mergeFixture } from "../tests/mergeFixture";
import { renderDiscover } from "../health/ui/renderDiscover";
import type { DiscoverViewModel } from "../health/ui/discoverViewModel";

type Element = InstanceType<typeof dom.Element>;
const root = (modal: { contentEl: HTMLElement }) => modal.contentEl as unknown as Element;
const element = (node: Element) => node as unknown as HTMLElement;
function events() {
  const listeners = new Map<string, Set<() => void>>();
  const bus = { on: (name: string, fn: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); return { name, fn }; },
    offref: ({ name, fn }: { name: string; fn: () => void }) => listeners.get(name)?.delete(fn) };
  return { bus, emit: (name: string) => [...listeners.get(name) ?? []].forEach(fn => fn()), count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0) };
}
function appEvents(app = {} as Record<string, unknown>) {
  const e = events();
  for (const key of ["vault", "metadataCache", "workspace"]) app[key] = Object.assign(app[key] ?? {}, e.bus);
  return { app: app as never, ...e };
}
const text = (e: Element) => e.all().map(n => n.text).join("\n");
const action = (e: Element, attribute: string, value: string) => e.querySelector(`[${attribute}="${value}"]`);

it.each(["ru", "en"] as const)("%s keeps exact consent private, collapsed and separately actionable", language => {
  setLanguage(language);
  const node = new dom.Element(), confirm = vi.fn(), cancel = vi.fn();
  const session = { view: { stage: "consent", consent: { provider: "Synthetic", model: "offline", endpoint: "https://example.test/v1/chat/completions",
    paths: ["A.md", "B.md"], characters: [12, 13], bytes: 99, body: '{"exact":"source"}' } }, confirm, cancel } as unknown as RelationshipSession;
  renderRelationshipView(element(node), session);
  expect(confirm).not.toHaveBeenCalled();
  expect(node.querySelectorAll("details").every(e => !e.open && !Object.prototype.hasOwnProperty.call(e.attrs, "open"))).toBe(true);
  expect(node.querySelector("pre")?.text).toBe(session.view.consent!.body);
  expect(text(node)).toContain(session.view.consent!.endpoint);
  expect(text(node)).not.toMatch(/@relationship\.|@ux\./);
  const send = action(node, "data-relationship-action", "confirm")!;
  expect(send.parentElement?.cls).toContain("ai-relationship-actions");
  expect(send.parentElement).toBe(action(node, "data-relationship-action", "cancel")?.parentElement);
  send.click(); expect(confirm).toHaveBeenCalledOnce();
});

describe("consolidation action choices", () => {
  it.each(["ru", "en"] as const)("%s groups existing actions, keeps no selection and exposes a real embed refusal", language => {
    setLanguage(language); const r = new dom.Element(), changed = vi.fn(); renderActionChoice(element(r), "", false, changed);
    expect(r.all().filter(e => e.tag === "optgroup")).toHaveLength(4);
    expect(r.all().filter(e => e.tag === "option")).toHaveLength(10);
    const select = action(r, "data-planner-field", "operation")!;
    expect(select.value).toBe(""); expect(changed).not.toHaveBeenCalled();
    expect(r.all().find(e => e.value === "replace_with_embed")!.disabled).toBe(true);
    select.change("replace_with_embed"); select.change("invented_action"); expect(changed).not.toHaveBeenCalled();
    select.change("copy_context_group"); expect(changed).toHaveBeenCalledExactlyOnceWith("copy_context_group");
    expect(text(r)).not.toMatch(/@(?:ux|planner)\./u);
    expect(r.all().some(e => e.value === "archive_in_place")).toBe(false);
  });
  it("switching action revokes the previous plan; model recommendations do not select an action", async () => {
    const f = mergeFixture(), session = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read });
    const r = new dom.Element(), review = vi.fn(); new ChangePlannerView(element(r), session, f.analysis, review);
    await session.prepare(); expect(action(r, "data-planner-field", "operation")!.value).toBe("");
    action(r, "data-planner-field", "operation")!.change("no_change");
    action(r, "data-planner-action", "build")!.click(); await vi.waitFor(() => expect(session.view.plan).toBeDefined());
    expect(review).not.toHaveBeenCalled(); expect(action(r, "data-safe-action", "review")).toBeUndefined();
    action(r, "data-planner-field", "operation")!.change("atomization_preview");
    expect(session.view.plan).toBeUndefined(); expect(action(r, "data-empty-atom-apply", "review")).toBeUndefined();
    expect(action(r, "data-safe-action", "review")).toBeUndefined(); session.close();
  });
  it.each(["disabled", "index-required", "ready"] as const)("history remains independent of Discover state %s", state => {
    const r = new dom.Element(), history = vi.fn(), semantic = vi.fn();
    renderDiscover(element(r), { title: "Discover", state, busy: true, actions: [], workflows: [] } as unknown as DiscoverViewModel,
      semantic, undefined, undefined, undefined, history);
    const open = action(r, "data-health-action", "consolidation-history")!;
    expect(open.disabled).toBe(false); expect(history).not.toHaveBeenCalled(); open.click();
    expect(history).toHaveBeenCalledOnce(); expect(semantic).not.toHaveBeenCalled();
  });
});

describe("UI grouping never grants recovery permission", () => {
  it("nests Merge Archive v1 under its exact Merge parent, preserving the typed boundary", async () => {
    const f = await archiveApplyFixture(), review = await f.review(), render = vi.fn();
    const parent: HistoryPresentation = { family: "merge", row: { id: f.mergeReview.id, record: f.mergeReview.record, damaged: false }, render };
    const archive: HistoryPresentation = { family: "archive", row: { id: review.id, record: review.record, damaged: false },
      parent: { family: "merge", record: review.record.parent }, render };
    expect(groupHistory([archive, parent])).toEqual([{ parent, archives: [archive], unverified: false }]);
    expect(groupHistory([archive, { ...parent, family: "group" }])).toHaveLength(2);
    expect(f.vault.process).not.toHaveBeenCalled(); f.archive.discard(review); f.service.dispose();
  });
  it.each(["group", "bundle"] as const)("groups the exact %s parent, refuses mismatched or damaged lineage and preserves all entries", async family => {
    const f = await structuralArchiveFixture(family), review = await f.archive.review(f.archivePlan, () => true), render = vi.fn();
    const parent: HistoryPresentation = { family, row: { id: f.parentId, record: review.record.parent, damaged: false }, render };
    const archive: HistoryPresentation = { family: "structuralArchive", row: { id: review.id, record: review.record, damaged: false },
      parent: { family, record: review.record.parent }, render };
    expect(groupHistory([archive, parent])).toEqual([{ parent, archives: [archive], unverified: false }]);
    const r = new dom.Element(); renderConsolidationHistory(element(r), [archive, parent]);
    expect(render.mock.calls.map(c => c[1] as unknown)).toEqual([true, false]); expect(f.vault.process).not.toHaveBeenCalled();
    const wrong = { ...archive, parent: { ...archive.parent!, record: { ...review.record.parent, createdAt: 1 } } };
    expect(groupHistory([wrong, parent])).toHaveLength(2);
    expect(groupHistory([wrong, parent]).find(g => g.parent === wrong)?.unverified).toBe(true);
    expect(groupHistory([{ ...archive, row: { ...archive.row, damaged: true } }, parent])).toHaveLength(2);
    const duplicate = { ...archive, row: { ...archive.row, id: "second" } };
    const duplicateRoot = new dom.Element(); renderConsolidationHistory(element(duplicateRoot), [parent, archive, duplicate]);
    expect(duplicateRoot.querySelector('[role="alert"]')).toBeDefined();
    f.archive.discard(review);
  });
});

describe("revocable reviews and history navigation", () => {
  it.each(["modify", "rename", "delete", "create", "changed", "resolved", "file-open", "layout-change"])("%s revokes a pending or displayed review once", event => {
    const e = appEvents(), invalidate = vi.fn(), lifetime = new ReviewLifetime(e.app, invalidate);
    expect(lifetime.current()).toBe(true); e.emit(event); e.emit(event);
    expect(lifetime.current()).toBe(false); expect(invalidate).toHaveBeenCalledOnce(); expect(e.count()).toBe(0);
  });
  it("after dispatch the executor owns mutation checks; closing still revokes the original predicate", () => {
    const e = appEvents(), invalidate = vi.fn(), lifetime = new ReviewLifetime(e.app, invalidate);
    lifetime.stop(); e.emit("modify"); expect(lifetime.current()).toBe(true); expect(invalidate).not.toHaveBeenCalled(); lifetime.close(); expect(lifetime.current()).toBe(false);
  });
  it("a changed source discards a late Single review and cannot restore a confirmation", async () => {
    const e = appEvents(), review = { id: "one", sourcePath: "A.md", before: "A", after: "B" };
    let done!: (r: typeof review) => void;
    const service = { discard: vi.fn(), apply: vi.fn(), undo: vi.fn() };
    const modal = new SafeApplyModal(e.app, service as unknown as SafeApplyService, () => new Promise(resolve => { done = resolve; }));
    modal.open(); e.emit("modify"); done(review); await vi.waitFor(() => expect(service.discard).toHaveBeenCalledWith(review));
    expect(action(root(modal), "data-safe-action", "confirm")).toBeUndefined(); expect(service.apply).not.toHaveBeenCalled(); modal.close();
  });
  it("History waits for an invalidated pending review to release the execution owner", async () => {
    const e = appEvents(), review = { id: "one", sourcePath: "A.md", before: "A", after: "B" }, navigate = vi.fn(), released = vi.fn();
    let done!: (r: typeof review) => void;
    const service = { discard: vi.fn(), apply: vi.fn(), undo: vi.fn() };
    const modal = new SafeApplyModal(e.app, service as unknown as SafeApplyService, () => new Promise(resolve => { done = resolve; }), false, released, navigate);
    modal.open(); e.emit("modify"); action(root(modal), "data-safe-action", "history")!.click();
    expect(navigate).not.toHaveBeenCalled(); expect(released).not.toHaveBeenCalled(); expect(root(modal).children).toHaveLength(0);
    done(review); await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce()); expect(released).toHaveBeenCalledOnce();
    expect(service.discard).toHaveBeenCalledWith(review); expect(service.apply).not.toHaveBeenCalled();
  });
  it("history ignores stale async results and has no background refresh or writes", async () => {
    const e = appEvents(); let done!: () => void;
    const multi = { history: vi.fn(async () => []) };
    const service = { history: vi.fn(() => new Promise<never[]>(resolve => { done = () => resolve([]); })), multi, apply: vi.fn(), undo: vi.fn() };
    const modal = new OperationHistoryModal(e.app, service as unknown as SafeApplyService);
    modal.open(); e.emit("modify");
    const refresh = action(root(modal), "data-safe-action", "refresh")!;
    expect(refresh.disabled).toBe(true); refresh.click(); expect(service.history).toHaveBeenCalledOnce();
    done(); await Promise.resolve(); await Promise.resolve();
    expect(multi.history).not.toHaveBeenCalled(); expect(refresh.disabled).toBe(false);
    expect(text(root(modal))).not.toContain("@ux."); expect(action(root(modal), "data-safe-action", "refresh")).toBeDefined();
    expect(service.history).toHaveBeenCalledOnce(); expect(service.apply).not.toHaveBeenCalled(); expect(service.undo).not.toHaveBeenCalled(); modal.close();
  });
  it.each(["group", "bundle"] as const)("%s Archive Undo → history → parent Undo uses the existing real services", async family => {
    const f = await structuralArchiveFixture(family), e = appEvents(f.app as unknown as Record<string, unknown>);
    const archiveReview = await f.archive.review(f.archivePlan, () => true); await f.archive.execute(archiveReview);
    f.vault.process.mockClear(); const disk = [...f.disk], contents = [...f.contents];
    const historyCalls = vi.spyOn(f.service, "history"), modal = new OperationHistoryModal(e.app, f.service); modal.open();
    await vi.waitFor(() => expect(root(modal).querySelector('[data-history-group]')).toBeDefined());
    expect(action(root(modal), `data-${family}-apply-action`, "undoReview")).toBeUndefined();
    expect([...f.disk]).toEqual(disk); expect([...f.contents]).toEqual(contents); expect(f.vault.process).not.toHaveBeenCalled();
    action(root(modal), "data-structural-archive-action", "undoReview")!.click();
    const undo = dom.modals[dom.modals.length - 1];
    await vi.waitFor(() => expect(action(undo.contentEl, "data-structural-archive-action", "confirm")).toBeDefined());
    const consent = undo.contentEl.querySelector('[data-structural-archive-ack]')!;
    expect(consent.checked).toBe(false); action(undo.contentEl, "data-structural-archive-action", "confirm")!.click(); expect(f.vault.process).not.toHaveBeenCalled();
    consent.checked = true; consent.change(); action(undo.contentEl, "data-structural-archive-action", "confirm")!.click();
    await vi.waitFor(() => expect(action(undo.contentEl, "data-structural-archive-action", "history")).toBeDefined());
    action(undo.contentEl, "data-structural-archive-action", "history")!.click(); expect(undo.opened).toBe(false);
    await vi.waitFor(() => expect(action(root(modal), `data-${family}-apply-action`, "undoReview")).toBeDefined());
    expect(historyCalls).toHaveBeenCalledTimes(2);
    expect(action(root(modal), "data-archive-v2-action", "open")).toBeUndefined();
    action(root(modal), `data-${family}-apply-action`, "undoReview")!.click(); const parentUndo = dom.modals[dom.modals.length - 1];
    await vi.waitFor(() => expect(action(parentUndo.contentEl, `data-${family}-apply-action`, "confirm")).toBeDefined());
    action(parentUndo.contentEl, `data-${family}-apply-action`, "confirm")!.click(); action(parentUndo.contentEl, `data-${family}-apply-action`, "confirm")?.click();
    await vi.waitFor(() => expect(action(parentUndo.contentEl, `data-${family}-apply-action`, "history")).toBeDefined());
    expect([...f.contents.values()]).toEqual(f.original); expect(f.vault.process).toHaveBeenCalledTimes(2);
    parentUndo.close(); modal.close(); f.service.dispose();
  });
  it("cancelling archive review leaves the planner reusable without a competing history read", async () => {
    const f = await structuralArchiveFixture("group"), e = appEvents(f.app as unknown as Record<string, unknown>);
    const readHistory = vi.spyOn(f.service, "history"), modal = new OperationHistoryModal(e.app, f.service);
    // The fixture already owns a ready plan; isolate the final-review handoff from planner rendering.
    const open = vi.spyOn(ArchivePlannerModalV2.prototype, "open").mockImplementation(() => {});
    try {
      modal.open(); await vi.waitFor(() => expect(action(root(modal), "data-archive-v2-action", "open")).toBeDefined());
      action(root(modal), "data-archive-v2-action", "open")!.click();
      const handoff = open.mock.contexts[0] as { apply(plan: ArchivePlanV2, current: () => boolean): void };
      for (let attempt = 0; attempt < 2; attempt++) {
        handoff.apply(f.archivePlan, () => true);
        const review = dom.modals[dom.modals.length - 1];
        await vi.waitFor(() => expect(action(review.contentEl, "data-structural-archive-action", "confirm")).toBeDefined());
        action(review.contentEl, "data-structural-archive-action", "cancel")!.click(); await Promise.resolve();
        expect(readHistory).toHaveBeenCalledOnce(); expect(f.vault.process).not.toHaveBeenCalled();
      }
    } finally { open.mockRestore(); modal.close(); f.service.dispose(); }
  });
});
