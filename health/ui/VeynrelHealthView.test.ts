import { ConnectionComparisonController } from "../connections/connectionComparisonController";
import { deriveConnectionComparison } from "../connections/deriveConnectionComparison";
import { semanticMap as comparisonSemanticMap, topologyMap as comparisonTopologyMap } from "../connections/testFixtures";
import { renderConnectionComparison, newConnectionComparisonViewState } from "../connections/renderConnectionComparison";
import { renderDiscover } from "./renderDiscover";
import { discoverViewModel } from "./discoverViewModel";
import { renderSemanticIntelligence } from "./renderSemanticIntelligence";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    open = false;
    children: Element[] = []; text = ""; cls = ""; tag = "div"; disabled = false; value = "";
    parentElement?: Element; scrollTop = 0; scrollLeft = 0; focusOptions?: FocusOptions;
    attrs: Record<string, string> = {}; listeners: Array<() => void> = [];
    ownerDocument: { activeElement: Element | null } = { activeElement: null };
    private append(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element {
      const child = new Element(); Object.assign(child, { tag, text: opts.text ?? "", cls: opts.cls ?? "", attrs: opts.attr ?? {}, ownerDocument: this.ownerDocument, parentElement: this });
      this.children.push(child); return child;
    }
    createSvg(tag: string, opts: { cls?: string; attr?: Record<string, string> } = {}): Element {
      if (opts.cls && /\s/u.test(opts.cls)) throw new Error("Native createSvg requires a single class token");
      return this.append(tag, opts);
    }
    createEl(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append(tag, opts); }
    createDiv(opts: { cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("div", opts); }
    createSpan(opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("span", opts); }
    addClass(...classes: string[]): void { this.cls += ` ${classes.join(" ")}`; }
    toggleClass(cls: string, enabled: boolean): void { if (enabled) this.addClass(cls); }
    empty(): void { this.children = []; this.text = ""; }
    setText(text: string): void { this.text = text; }
    setAttribute(key: string, value: string): void { this.attrs[key] = value; }
    getAttribute(key: string): string | null { return this.attrs[key] ?? null; }
    contains(child: Element): boolean { return this.all().includes(child); }
    querySelectorAll(selector: string): Element[] {
      if (selector === "details[data-health-disclosure]") return this.all().filter(e => e.tag === "details" && e.attrs["data-health-disclosure"] !== undefined);
      throw new Error(`Unsupported test selector: ${selector}`);
    }
    querySelector(selector: string): Element | undefined {
      if (selector === "summary") return this.all().find(e => e.tag === "summary");
      const attribute = selector.match(/^\[([\w-]+)\]$/u)?.[1];
      if (attribute) return this.all().find((e) => e.attrs[attribute] !== undefined);
      const action = selector.match(/="([^"]+)"/u)?.[1];
      return action ? this.all().find((e) => e.attrs["data-health-action"] === action) : undefined;
    }
    focus(options?: FocusOptions): void { if (!this.disabled) { this.ownerDocument.activeElement = this; this.focusOptions = options; } }
    addEventListener(_type: string, fn: () => void): void { this.listeners.push(fn); }
    removeEventListener(_type: string, fn: () => void): void { this.listeners = this.listeners.filter((item) => item !== fn); }
    click(): void { for (const listener of this.listeners) listener(); }
    input(value: string): void { this.value = value; for (const listener of this.listeners) listener(); }
    all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
    action(key: string): Element { return this.all().find((e) => e.attrs["data-health-action"] === key)!; }
    texts(): string { return this.all().map((e) => e.text).join("\n"); }
  }
  class Modal {
    static opened: Modal[] = [];
    contentEl = new Element(); titleEl = new Element();
    onOpen(): void {} onClose(): void {}
    open(): void { Modal.opened.push(this); this.onOpen(); } close(): void { this.onClose(); }
  }
  class ItemView { contentEl = new Element(); app: unknown; constructor(leaf: { app: unknown }) { this.app = leaf.app; } }
  class TFile { path = "A.md"; basename = "A"; extension = "md"; stat = { mtime: 1 }; }
  return { Element, Modal, ItemView, TFile, requestUrl: vi.fn() };
});
vi.mock("obsidian", () => ({ ...mocks, setIcon: vi.fn(), Notice: vi.fn(), getLanguage: () => "en", parseLinktext: (link: string) => ({ path: link, subpath: "" }) }));
import { setLanguage, t } from "../../i18n";
import { HealthPluginController } from "../obsidian/healthPluginController";
import { appFixture, flush, root, preferencesFixture } from "../obsidian/testSupport";
import type { HealthPreferences } from "../preferences";
import { VeynrelHealthView } from "./VeynrelHealthView";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { registerHealth } from "../obsidian/registerHealth";
import { openHealthView } from "../obsidian/openHealthView";
import { openHealthNote, openHealthNotePair } from "../obsidian/openHealthNote";
import { inboxFinding, toolsFixture } from "./testSupport";
import { serializeHealth } from "../store/codec";
import type { SemanticIntelligencePort } from "../semanticIntelligencePort";
import { SemanticIntelligenceController } from "../../semantic/product/semanticIntelligenceController";
import { DEFAULT_EMBEDDING_SETTINGS } from "../../embeddings/types";
import type { EmbeddingSettings } from "../../embeddings/types";
import type { SemanticStatus } from "../../semantic/types";
import type { SemanticDuplicatePair } from "../../semantic/types";
import type { SemanticHealthAnalysisPort } from "../semanticHealthAnalysisPort";
import { SemanticHealthAnalysisAdapter } from "../../semantic/health/semanticHealthAnalysisAdapter";
import { DeepIntelligenceController } from "../../deep/product/deepIntelligenceController";
import type { LanguageModelSettingsSnapshot } from "../../deep/product/languageModelSettingsPort";
import type { DeepIntelligencePort } from "../deepIntelligencePort";
import { deepIntelligenceViewModel, deepSetupError } from "./deepIntelligenceViewModel";
import type { DeepHealthAnalysisPort, DeepKnowledgeAnalysis, DeepKnowledgeConsent, DeepKnowledgeProgress } from "../deepHealthAnalysisPort";
import { candidate } from "../store/testSupport";
import { withAbort } from "../analyzers/local/cancellation";
import { VaultTopologyController } from "../topology/vaultTopologyController";
import { ObsidianLocalVaultSource } from "../analyzers/local/obsidianLocalVaultSource";
import { note, snapshot } from "../analyzers/local/testFixtures";
import { deriveTopology } from "../topology/deriveTopology";
import { renderTopology } from "../topology/renderTopology";
import { newTopologyViewState } from "../topology/renderTopologyMap";

import { ConnectController } from "../../connect/product/connectController";
import type { CompanionSettings, CompanionConnectionStatus } from "../../companionSync/types";
import type { ConnectPort } from "../connectPort";
import { productFixture } from "../../recall/product/testSupport";
import type { RecallProductPort } from "../../recall/product/types";

beforeEach(() => { setLanguage("en"); mocks.Modal.opened = []; });
function fixture(initial: Partial<HealthPreferences> = { profileChosen: true, onboardingCompleted: true }, semantic?: SemanticIntelligencePort,
  semanticAnalysis?: SemanticHealthAnalysisPort, deep?: DeepIntelligencePort, deepAnalysis?: DeepHealthAnalysisPort, connect?: ConnectPort, recall?: RecallProductPort) {
  const f = appFixture(); const file = new mocks.TFile(); f.vault.getAbstractFileByPath.mockReturnValue(file);
  const p = preferencesFixture(initial);
  const controller = new HealthPluginController(f.app, "ai-knowledge-hub", p.preferences, semanticAnalysis, undefined, deepAnalysis);
  const tools = toolsFixture(); const view = new VeynrelHealthView({ app: f.app } as never, controller, tools, semantic, recall, deep, undefined, connect);
  return { ...f, ...p, controller, tools, view, content: view.contentEl as unknown as InstanceType<typeof mocks.Element> };
}

describe("native Health view lifecycle", () => {
  it("opening only initializes storage; a click scans once and notifications update the dashboard", async () => {
    const f = fixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.content.texts()).toContain("Coverage not established");
    let release!: (body: string) => void; f.vault.read.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const oldButton = f.content.action("scan"); oldButton.click(); oldButton.click(); await flush();
    expect(f.vault.read).toHaveBeenCalledTimes(1); expect(f.content.action("scan").disabled).toBe(true);
    expect(f.content.texts()).toContain("Checking your vault…");
    expect(f.content.getAttribute("aria-busy")).toBeNull(); // The live region stays available while the dashboard is busy.
    expect(f.content.all().find((e) => e.attrs.role === "status")?.attrs["aria-live"]).toBe("polite");
    const pending = f.controller.runLocalScan(); release("Meaningful content longer than thirty two characters for the scan."); await pending;
    expect(f.content.texts()).toContain("Vault check complete"); expect(f.content.texts()).toContain("Review recommended");
    expect(f.content.action("scan").disabled).toBe(false); expect(f.content.action("open-note")).toBeDefined();
    f.content.action("nav-tools").click(); expect(f.content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(f.content.action("tools")).toBeUndefined();
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
  });
  it("close unsubscribes without cancelling; reopen reflects the same plugin-owned running scan", async () => {
    const f = fixture(); const realSubscribe = f.controller.subscribe.bind(f.controller);
    const removals: ReturnType<typeof vi.fn>[] = [];
    const subscribe = vi.spyOn(f.controller, "subscribe").mockImplementation((listener) => {
      const remove = vi.fn(realSubscribe(listener)); removals.push(remove); return remove;
    }); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.vault.read.mockReturnValueOnce(new Promise(() => {})); f.content.action("scan").click(); await flush();
    await f.view.onClose(); expect(f.content.children).toHaveLength(0); expect(removals[0]).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().busy).toBe(true);
    await f.view.onOpen(); f.content.action("nav-health")?.click(); expect(f.content.action("scan").disabled).toBe(true);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await f.view.onClose(); expect(removals[1]).toHaveBeenCalledTimes(1); f.controller.dispose(); await flush();
    expect(f.content.children).toHaveLength(0); expect(f.controller.getState().busy).toBe(false);
  });
  it("closing during initialization does not attach a late subscription", async () => {
    const f = fixture(); let release!: (exists: boolean) => void;
    f.adapter.exists.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const subscribe = vi.spyOn(f.controller, "subscribe"); const opening = f.view.onOpen();
    await f.view.onClose(); release(false); await opening;
    expect(subscribe).not.toHaveBeenCalled(); expect(f.content.children).toHaveLength(0);
  });
  it("keeps an initialization failure visible in the workspace as well as announced", async () => {
    const f = fixture(); vi.spyOn(f.controller, "getHealthService").mockRejectedValueOnce(new Error("private"));
    await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.all().find((e) => e.cls === "veynrel-workspace")?.texts()).toContain(t("@health.error.load"));
    expect(f.content.all().find((e) => e.attrs.role === "status")?.text).toBe(t("@health.error.load"));
    expect(f.content.texts()).not.toContain("private");
    await f.view.onClose(); f.controller.dispose();
  });
  it("rechecks note existence at click time and leaves Findings unchanged if the note disappeared", async () => {
    const f = fixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.controller.runLocalScan();
    const service = await f.controller.getHealthService(); const before = service.listFindings();
    f.vault.getAbstractFileByPath.mockReturnValue(null);
    f.content.action("open-note").click(); await flush();
    expect(f.content.texts()).toContain("This note is no longer available"); expect(f.openFile).not.toHaveBeenCalled();
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toContain("This note is no longer available");
    expect(service.listFindings()).toEqual(before); expect(f.content.action("open-note")).toBeUndefined();
  });
  it("blocking recovery requires modal confirmation and Cancel leaves files untouched", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, "{bad"); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("scan")).toBeUndefined(); f.content.action("recover").click();
    const modal = mocks.Modal.opened[0]; expect(modal.contentEl.texts()).toContain("does not delete or edit your notes");
    modal.contentEl.all().find((e) => e.text === "Cancel")!.click(); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.content.action("recover").click(); const confirmation = mocks.Modal.opened[1];
    confirmation.contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.action("nav-home")).toBeDefined()); f.content.action("nav-health").click();
    expect(f.content.texts()).toContain("Coverage not established"); expect(f.vault.read).not.toHaveBeenCalled();
  });
});

describe("inline Deep Intelligence boundaries", () => {
  const elapsedTimers = { setInterval: vi.fn((_callback: () => void, _delay: number) => 1), clearInterval: vi.fn((_id: number) => {}) };
  beforeEach(() => { elapsedTimers.setInterval.mockClear(); elapsedTimers.clearInterval.mockClear(); vi.stubGlobal("window", { setTimeout, clearTimeout, ...elapsedTimers }); });
  afterEach(() => vi.unstubAllGlobals());
  function deepFixture(configured = true, deepAnalysis?: DeepHealthAnalysisPort) {
    let current: LanguageModelSettingsSnapshot = { provider: "openrouter", model: "legacy-model", baseUrl: "https://llm.example/v1",
      apiKey: configured ? "synthetic-DO-NOT-EXPOSE-key" : "", temperature: 0.5, topK: 8 };
    const listeners = new Set<() => void>(); const emit = () => { for (const listener of listeners) listener(); };
    const settings = { get: () => ({ ...current }), update: vi.fn(async (next: LanguageModelSettingsSnapshot) => { current = { ...next }; emit(); return { ...current }; }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    const connection = { test: vi.fn(async (_settings: LanguageModelSettingsSnapshot) => {}) };
    const deep = new DeepIntelligenceController(settings, connection);
    const f = fixture(undefined, undefined, undefined, deep, deepAnalysis); const cachedRead = vi.fn(); Object.assign(f.vault, { cachedRead });
    const second = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, undefined, undefined, deep);
    const secondContent = second.contentEl as unknown as InstanceType<typeof mocks.Element>;
    return { ...f, second, secondContent, deep, settings, connection, cachedRead,
      change: (patch: Partial<LanguageModelSettingsSnapshot>) => { current = { ...current, ...patch }; emit(); } };
  }
  function noWork(f: ReturnType<typeof deepFixture>, openedViews = 1) {
    expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(openedViews); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.cachedRead).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
  }
  it("retains a disclosure and its keyboard focus on notification, but resets it on navigation", async () => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    const summary = f.content.action("deep-about");
    summary.parentElement!.open = true; summary.focus(); f.content.scrollTop = 700;
    f.change({ model: "another-model" });
    expect(f.content.action("deep-about").parentElement!.open).toBe(true);
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("deep-about"));
    expect(f.content.ownerDocument.activeElement?.focusOptions).toEqual({ preventScroll: true });
    expect(f.content.scrollTop).toBe(700); noWork(f);
    f.content.action("nav-tools").click(); f.content.action("nav-settings").click();
    expect(f.content.action("deep-about").parentElement!.open).toBe(false);
    await f.view.onClose(); f.deep.dispose(); f.controller.dispose();
  });
  function knowledgeFixture() {
    const result: DeepKnowledgeAnalysis = { revision: { token: "opaque" }, complete: true, totalFiles: 1, analyzedFiles: 1,
      candidates: [candidate({ analyzerId: "knowledge-quality", dimension: "knowledge", source: "deep-ai", type: "knowledge-draft", impact: "review", confidence: "medium",
        notePaths: ["A.md"], title: "Knowledge note may need development", explanation: "Deep analysis suggests this note may be incomplete or underdeveloped.",
        evidence: [{ kind: "deep-quality", value: "draft", path: "A.md" }], actions: [{ kind: "open-note", path: "A.md" }] })] };
    const analysis = { getConsent: () => ({ configurationRevision: 1, providerKind: "cloud" as const }), analyzeKnowledge: vi.fn(async (_signal: AbortSignal, _consent: DeepKnowledgeConsent, _onProgress?: (progress: DeepKnowledgeProgress) => void) => {
      f.vault.getMarkdownFiles(); await f.cachedRead(); mocks.requestUrl(); return result;
    }), verifyCurrent: vi.fn(async () => {}) };
    const f = deepFixture(true, analysis); return { ...f, analysis, result };
  }
  it.each(["en", "ru"] as const)("Knowledge confirmation, cancel and navigation perform zero work in %s", async (language) => {
    setLanguage(language); const f = knowledgeFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("deep-knowledge").click();
    expect(f.content.texts()).toContain(language === "en" ? "bounded note content" : "ограниченный объём");
    expect(f.content.texts()).toContain(language === "en" ? "costs" : "плату");
    expect(f.content.ownerDocument.activeElement?.attrs["data-knowledge-confirmation"]).toBe("true");
    noWork(f); expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled();
    const staleStart = f.content.action("knowledge-start");
    f.content.action("knowledge-back").click(); staleStart.click(); noWork(f);
    f.content.action("deep-knowledge").click(); f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action("nav-health").click();
    expect(f.content.action("knowledge-start")).toBeUndefined(); staleStart.click(); noWork(f);
    await f.view.onClose(); expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled();
  });
  it.each(["en", "ru"] as const)("confirmed Knowledge creates one localized Finding and card filter in %s", async (language) => {
    setLanguage(language); const f = knowledgeFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("deep-knowledge").click(); const start = f.content.action("knowledge-start"); start.click(); start.click();
    await vi.waitFor(() => expect(f.controller.getState().deepOutcome?.historyRecorded).toBe(true));
    expect(f.analysis.analyzeKnowledge).toHaveBeenCalledTimes(1); expect(f.connection.test).not.toHaveBeenCalled();
    expect(f.controller.getState().snapshot?.dimensions.knowledge).toMatchObject({ state: "review-recommended", analysisDepth: "deep" });
    f.content.action("dimension-knowledge").click(); expect(f.content.action("filter-knowledge").attrs["aria-pressed"]).toBe("true");
    const id = f.controller.listFindings()[0].id; f.content.action(`finding-${id}`).click();
    expect(f.content.texts()).toContain(language === "en" ? "Deep assessment: Draft" : "Оценка глубокого анализа: черновик");
    expect(f.content.texts()).not.toContain("deep-ai"); expect(f.content.texts()).not.toContain("@knowledge");
    f.content.action("finding-note-0").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
  });
  it("running Knowledge exposes cancel, excludes other Health scans, and late work cannot resurrect closed UI", async () => {
    const f = knowledgeFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.second.onOpen(); f.secondContent.action("nav-health")?.click(); let release!: (value: DeepKnowledgeAnalysis) => void;
    f.analysis.analyzeKnowledge.mockImplementationOnce((signal) => withAbort(new Promise<DeepKnowledgeAnalysis>((resolve) => { release = resolve; }), signal));
    f.content.action("deep-knowledge").click(); f.content.action("knowledge-start").click(); await flush();
    expect(f.content.texts()).toContain("Preparing analysis…"); expect(f.secondContent.action("knowledge-cancel")).toBeDefined();
    expect(f.content.action("scan").disabled).toBe(true);
    f.secondContent.action("nav-settings").click(); expect(f.secondContent.action("deep-check").disabled).toBe(true);
    f.content.action("knowledge-cancel").click(); await flush();
    expect(f.controller.getState().deepScanRunning).toBe(false); expect(f.content.texts()).toContain("Knowledge check cancelled");
    expect(f.controller.listFindings()).toEqual([]); expect(f.controller.getState().deepOutcome?.scan.status).toBe("failed");
    await f.view.onClose(); release(f.result); await flush(); expect(f.content.children).toHaveLength(0);
    expect(f.controller.listFindings()).toEqual([]); expect(f.connection.test).not.toHaveBeenCalled();
  });
  it("renders real counters in both views, updates elapsed only, and cleans up on failure/restart/close", async () => {
    const f = knowledgeFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.second.onOpen(); f.secondContent.action("nav-health")?.click();
    let progress!: (progress: DeepKnowledgeProgress) => void;
    let fail!: (reason: Error) => void;
    f.analysis.analyzeKnowledge.mockImplementationOnce((_signal, _consent, onProgress) => {
      progress = onProgress!; return new Promise((_resolve, reject) => { fail = reject; });
    });
    f.content.action("deep-knowledge").click(); f.content.action("knowledge-start").click(); await flush();
    progress({ stage: "reading", current: 327, total: 500 });
    for (const content of [f.content, f.secondContent]) expect(content.texts()).toContain("327 / 500 notes processed");
    progress({ stage: "mapping", current: 47, total: 100 });
    expect(f.content.texts()).toContain("47 / 100 batches processed");
    expect(f.content.texts()).toContain("Notes are not modified");
    const started = f.controller.getState().deepProgress!.startedAt;
    const now = vi.spyOn(Date, "now").mockReturnValue(started + 258000);
    const tick = elapsedTimers.setInterval.mock.calls.at(-1)![0]; tick();
    expect(f.secondContent.texts()).toContain("Elapsed: 4m 18s");
    expect(f.analysis.analyzeKnowledge).toHaveBeenCalledTimes(1);
    fail(new Error("PRIVATE_PROVIDER")); await flush();
    expect(f.controller.getState()).toMatchObject({ deepScanRunning: false, deepProgress: undefined });
    expect(f.content.texts()).not.toContain("47 / 100"); expect(f.content.texts()).not.toContain("PRIVATE_PROVIDER");
    let finish!: (result: DeepKnowledgeAnalysis) => void;
    f.analysis.analyzeKnowledge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.content.action("deep-knowledge").click(); f.content.action("knowledge-start").click(); await flush();
    expect(f.content.texts()).toContain("Preparing analysis…"); expect(f.content.texts()).toContain("Elapsed: 0m 00s");
    const clear = elapsedTimers.clearInterval.mock.calls.length;
    await f.view.onClose(); await f.second.onClose();
    expect(elapsedTimers.clearInterval.mock.calls.length).toBeGreaterThan(clear);
    finish(f.result); await flush(); now.mockRestore(); f.controller.dispose();
  });
  it("Configured can analyze after restart, while Unconfigured/Busy/Error cannot; Check and Connect never analyze", async () => {
    const f = knowledgeFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("deep-knowledge")).toBeDefined();
    f.connection.test.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_BODY"));
    f.content.action("nav-settings").click(); f.content.action("deep-check").click(); await flush();
    f.content.action("nav-health").click(); expect(f.content.action("deep-knowledge")).toBeUndefined();
    await f.deep.checkCurrentSetup(); expect(f.content.action("deep-knowledge")).toBeDefined();
    const draft = f.deep.createDraft("ollama"); await f.deep.connect(draft);
    expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled(); expect(f.controller.listFindings()).toEqual([]);
    noWork(f); f.change({ model: "" }); expect(f.content.action("deep-knowledge")).toBeUndefined();
  });
  it.each([true, false])("passive legacy configuration is safe and does no work (configured: %s)", async (configured) => {
    const f = deepFixture(configured); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("deep-check")).toBeUndefined();
    f.content.action("nav-settings").click();
    expect(f.content.texts()).toContain(configured ? "Configured" : "Not configured");
    const publicValues = JSON.stringify([f.deep.getSnapshot(), f.controller.getState(), deepIntelligenceViewModel(f.deep.getSnapshot()),
      f.content.all().map((element) => ({ text: element.text, value: element.value, attrs: element.attrs }))]);
    expect(publicValues.includes("synthetic-DO-NOT-EXPOSE-key")).toBe(false);
    f.content.action("nav-health").click();
    expect(f.content.all().find((element) => element.attrs["data-dimension"] === "knowledge")?.texts()).toContain("Not enabled");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action("nav-discover").click(); f.content.action("nav-health").click();
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it.each(["en", "ru"] as const)("localizes chooser/forms/errors and keeps all inputs labelled in %s", async (language) => {
    setLanguage(language); const f = deepFixture(false); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("deep-setup").click();
    for (const provider of ["ollama", "openrouter", "openai", "groq", "custom"]) {
      const choice = f.content.action(`deep-provider-${provider}`); expect(choice.tag).toBe("button"); choice.click();
      expect(f.content.action(`deep-provider-${provider}`).attrs["aria-pressed"]).toBe("true");
      expect(f.content.action("deep-field-model").tag).toBe("input");
      expect(Boolean(f.content.action("deep-field-baseUrl"))).toBe(provider === "custom");
      const key = f.content.action("deep-field-apiKey");
      expect(Boolean(key)).toBe(provider !== "ollama");
      if (key) expect(key.attrs).toMatchObject({ type: "password", autocomplete: "off" });
      for (const field of f.content.all().filter((element) => element.tag === "input")) {
        expect(f.content.all().some((element) => element.tag === "label" && element.children.includes(field) && element.children[0].text.length > 0)).toBe(true);
      }
    }
    f.content.action("deep-connect").click(); await flush();
    expect(f.content.texts()).toContain(language === "en" ? "Enter a model" : "Укажите модель");
    expect(f.content.texts()).not.toContain("@deep.");
    for (const reason of ["connection", "save", "busy", "invalid"] as const) expect(deepSetupError({ ok: false, reason })).not.toContain("@deep.");
    expect(f.connection.test).not.toHaveBeenCalled(); noWork(f);
  });
  it("keys appear only in intentional password editing and drafts are discarded on Back", async () => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); f.content.action("deep-change").click(); f.content.action("deep-provider-openrouter").click();
    const key = f.content.action("deep-field-apiKey"); expect(key.value === f.settings.get().apiKey).toBe(true);
    expect(key.attrs.type).toBe("password"); expect(f.content.texts().includes(key.value)).toBe(false);
    key.input("synthetic-discarded-draft"); f.content.action("deep-back").click();
    f.content.action("deep-change").click(); f.content.action("deep-provider-openrouter").click();
    expect(f.content.action("deep-field-apiKey").value === "synthetic-discarded-draft").toBe(false);
    expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it("an already-open form cannot overwrite a newer Advanced edit", async () => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); f.content.action("deep-change").click(); f.content.action("deep-provider-ollama").click();
    f.change({ model: "new-advanced-model" }); f.content.action("deep-connect").click(); await flush();
    expect(f.settings.get().model).toBe("new-advanced-model"); expect(f.content.texts()).toContain("Couldn't save");
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it.each([false, true])("Deep status never hides subsequent Health scan feedback (failed check: %s)", async (failed) => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    if (failed) f.connection.test.mockRejectedValueOnce(new Error("fixture"));
    await f.deep.checkCurrentSetup(); await f.controller.runLocalScan();
    const status = f.content.all().find((element) => element.attrs.role === "status")!.text;
    expect(status).toContain("Vault check complete"); expect(status).toContain(failed ? "Connection failed" : "Connected");
  });
  it("two views share Busy/Ready/Error and Advanced changes; closing one only removes its subscription", async () => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); await f.second.onOpen(); f.secondContent.action("nav-settings")?.click(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    f.content.action("deep-check").click();
    expect(f.content.texts()).toContain("Checking…"); expect(f.secondContent.texts()).toContain("Checking…");
    expect(f.secondContent.action("deep-check").disabled).toBe(true); expect(f.secondContent.action("deep-change").disabled).toBe(true);
    f.secondContent.action("nav-health").click();
    expect(f.secondContent.action("scan").disabled).toBe(false); expect(f.secondContent.action("nav-findings").disabled).toBe(false);
    f.secondContent.action("nav-settings").click();
    release(); await flush(); expect(f.secondContent.texts()).toContain("Connected"); expect(f.settings.update).not.toHaveBeenCalled();
    f.connection.test.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    f.secondContent.action("deep-check").click(); await flush();
    expect(f.content.texts()).toContain("Connection failed"); expect(f.secondContent.texts()).toContain("Connection failed");
    expect(f.content.texts()).not.toContain("synthetic-DO-NOT-EXPOSE-key");
    await f.view.onClose(); f.change({ model: "advanced-model" });
    expect(f.content.children).toHaveLength(0); expect(f.secondContent.texts()).toContain("OpenRouter · advanced-model");
    expect(f.secondContent.texts()).toContain("Configured"); expect(f.connection.test).toHaveBeenCalledTimes(2); noWork(f, 2);
  });
  it.each(["navigate", "close", "back"] as const)("late Connect may save but cannot resurrect a form after %s", async (action) => {
    const f = deepFixture(false); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.second.onOpen(); f.secondContent.action("nav-health")?.click(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    f.content.action("deep-setup").click(); f.content.action("deep-provider-ollama").click();
    f.content.action("deep-field-model").input("chosen-model"); f.content.action("deep-connect").click();
    expect(f.content.action("deep-connect").disabled).toBe(true); expect(f.secondContent.texts()).toContain("Connecting…");
    if (action === "navigate") { f.content.action("nav-health").click(); f.content.action("nav-findings").click(); }
    else if (action === "close") await f.view.onClose();
    else f.content.action("deep-back").click();
    release(); await flush(); expect(f.settings.get().model).toBe("chosen-model"); expect(f.settings.update).toHaveBeenCalledTimes(1);
    expect(f.content.action("deep-field-model")).toBeUndefined(); expect(f.secondContent.texts()).toContain("Connected");
    if (action === "close") expect(f.content.children).toHaveLength(0);
    if (action === "navigate") expect(f.content.action("nav-findings").attrs["aria-current"]).toBe("page");
    noWork(f, 2);
  });
  it.each(["connection", "save"] as const)("failed %s keeps the form and committed configuration with safe feedback", async (failure) => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); const before = f.settings.get();
    if (failure === "connection") f.connection.test.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    else f.settings.update.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    f.content.action("deep-change").click(); f.content.action("deep-provider-ollama").click();
    f.content.action("deep-connect").click(); await flush();
    expect(f.settings.get()).toEqual(before); expect(f.content.action("deep-field-model")).toBeDefined();
    expect(f.content.texts()).toContain(failure === "connection" ? "Couldn't connect" : "Couldn't save");
    expect(f.content.all().find((e) => e.cls.includes("veynrel-deep"))?.texts()).toContain(failure === "connection" ? "Couldn't connect" : "Couldn't save");
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toBe("");
    expect(f.content.texts()).not.toContain("synthetic-DO-NOT-EXPOSE-key"); expect(f.content.action("deep-connect").disabled).toBe(false); noWork(f);
  });
});

describe("inline Semantic Intelligence boundaries", () => {
  function semanticFixture(enabled = false, kind: SemanticStatus["kind"] = "not-initialized", vectorCount = 0) {
    let effective = { ...DEFAULT_EMBEDDING_SETTINGS, enabled };
    let status: SemanticStatus = { kind, vectorCount, vectorGeneration: 0, dimensions: 3, providerLabel: "OpenRouter", model: effective.embeddingModel };
    const settings = { get: () => ({ ...effective }), update: vi.fn(async (next: EmbeddingSettings) => { effective = { ...next }; return { ...next }; }) };
    const engine = { getSemanticStatus: () => ({ ...status }), refreshSemanticStatus: vi.fn(async () => ({ ...status })),
      getCachedIndexState: () => ({ ...status, provider: effective.embeddingProvider, configurationRevision: 0, runtimeRevision: 1 }),
      findPotentialDuplicates: vi.fn(async (): Promise<SemanticDuplicatePair[]> => []),
      indexVault: vi.fn(async () => { status = { ...status, kind: "ready", vectorCount: 3 }; }),
      rebuildIndex: vi.fn(async () => { status = { ...status, kind: "ready", vectorCount: 3 }; }),
      openSearch: vi.fn(), openSimilarNotes: vi.fn(), openPotentialDuplicates: vi.fn() };
    const semantic = new SemanticIntelligenceController(settings, engine);
    const f = fixture(undefined, semantic, new SemanticHealthAnalysisAdapter(engine)); const scan = vi.spyOn(f.controller, "runLocalScan");
    const semanticScan = vi.spyOn(f.controller, "runSemanticScan");
    return { ...f, semantic, engine, settings, scan, semanticScan };
  }
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout }); mocks.requestUrl.mockReset();
    mocks.requestUrl.mockResolvedValue({ status: 200, text: '{"embeddings":[[1,0,0]],"data":[{"embedding":[1,0,0]}]}' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["en", "ru"] as const)("disabled Discover owns its visible status and retains the global live region in %s", async (language) => {
    setLanguage(language); const f = semanticFixture(false, "not-initialized", 0); await f.view.onOpen(); f.content.action("nav-health")?.click();
    const live = f.content.all().find((e) => e.attrs.role === "status")!;
    f.content.action("nav-discover").click();
    expect(f.content.all().find((e) => e.attrs.role === "status")).toBe(live);
    expect(live.attrs).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" });
    expect(live.text).toContain(t("@discover.required"));
    expect(f.content.all().find((e) => e.cls.includes("veynrel-discover"))?.texts()).toContain(t("@discover.required"));
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toBe("");
    await f.view.onClose(); f.controller.dispose();
  });

  it.each([
    [false, "not-initialized", 0], [true, "not-initialized", 0], [true, "ready", 4],
    [true, "incompatible", 4], [true, "error", 0], [true, "ready", 0], [true, "indexing", 4],
  ] as const)("Discover navigation is passive (enabled %s, %s, %s vectors)", async (enabled, kind, count) => {
    const f = semanticFixture(enabled, kind, count); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("nav-")).map((e) => e.attrs["data-health-action"]))
      .toEqual(["nav-home", "nav-discover", "nav-health", "nav-process", "nav-recall", "nav-tools", "nav-history", "nav-settings", "nav-findings"]);
    f.content.action("nav-discover").click();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(f.content.all().find((e) => e.tag === "h1")?.text).toBe("Review vault");
    expect(f.content.ownerDocument.activeElement?.text).toBe("Review vault");
    expect(f.content.all().find((e) => e.tag === "nav")?.attrs["aria-label"]).toBe("Veynrel navigation");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); expect(f.content.action("state-open")).toBeDefined();
    f.content.action("nav-discover").click(); f.content.action("nav-health").click(); expect(f.content.action("scan")).toBeDefined();
    f.content.action("nav-discover").click(); await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
    expect(f.engine.openSearch).not.toHaveBeenCalled(); expect(f.engine.openSimilarNotes).not.toHaveBeenCalled();
    expect(f.engine.openPotentialDuplicates).not.toHaveBeenCalled();
    expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled(); expect(f.semanticScan).not.toHaveBeenCalled();
    expect(Boolean(f.content.action("semantic-health-scan"))).toBe(false); // Reopened on Health, never auto-run.
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    expect(f.scan).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.adapter.write).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it.each(["en", "ru"] as const)("explicit Semantic Health scan produces localized Inbox Findings in %s and preserves dismissal on repeat", async (language) => {
    setLanguage(language); const f = semanticFixture(true, "ready", 8);
    const pair: SemanticDuplicatePair = { leftPath: "B.md", rightPath: "A.md", score: 0.971, leftMatches: [], rightMatches: [] };
    f.engine.findPotentialDuplicates.mockResolvedValue([pair]);
    await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    const section = f.content.all().find((element) => element.cls === "veynrel-discover-health")!;
    expect(section).toBeDefined(); expect(section.action("discover-duplicates")).toBeUndefined();
    expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled();
    const button = f.content.action("semantic-health-scan"); button.focus(); button.click(); button.click();
    await vi.waitFor(() => expect(f.controller.getState().semanticOutcome?.historyRecorded).toBe(true));
    expect(f.engine.findPotentialDuplicates).toHaveBeenCalledTimes(1);
    expect(f.content.texts()).toContain(language === "en" ? "Semantic duplicate check complete" : "Проверка смысловых дубликатов завершена");
    const finding = f.controller.listFindings()[0]; expect(finding.notePaths).toEqual(["A.md", "B.md"]);
    f.content.action("nav-health").click();
    expect(f.content.texts()).toContain(language === "en" ? "Review recommended" : "Рекомендуется проверить");
    expect(f.content.texts()).toContain(language === "en" ? "Possible semantic duplicate" : "Возможный смысловой дубликат");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click();
    expect(f.content.texts()).toContain(language === "en" ? "2 notes" : "Заметок: 2");
    f.content.action(`finding-${finding.id}`).click();
    expect(f.content.texts()).toContain(language === "en" ? "Semantic analysis" : "Семантический анализ");
    expect(f.content.texts()).toContain(language === "en" ? "Semantic similarity: 97%" : "Сходство по смыслу: 97%");
    expect(f.content.action("finding-note-0").text).toBe("A.md"); expect(f.content.action("finding-note-1").text).toBe("B.md");
    f.content.action("finding-note-0").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.content.action("finding-dismiss").click();
    await vi.waitFor(() => expect(f.controller.getFinding(finding.id)?.state).toBe("dismissed"));
    expect(f.content.action(`finding-${finding.id}`)).toBeUndefined();
    f.content.action("nav-discover").click(); f.content.action("semantic-health-scan").click();
    await vi.waitFor(() => expect(f.engine.findPotentialDuplicates).toHaveBeenCalledTimes(2)); await flush();
    expect(f.controller.getFinding(finding.id)?.state).toBe("dismissed");
    expect(f.engine.openPotentialDuplicates).not.toHaveBeenCalled(); expect(mocks.requestUrl).not.toHaveBeenCalled();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    expect(f.adapter.write.mock.calls.every(([path]) => path.startsWith(`${root}/`))).toBe(true);
    await f.view.onClose();
  });

  it("shows semantic busy state across close/reopen, excludes Local scans and leaves exploratory workflows usable", async () => {
    const f = semanticFixture(true, "ready", 8); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    let release!: (pairs: SemanticDuplicatePair[]) => void;
    f.engine.findPotentialDuplicates.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const button = f.content.action("semantic-health-scan"); button.click(); button.click(); await flush();
    expect(f.content.action("semantic-health-scan").disabled).toBe(true);
    expect(f.content.texts()).toContain("Checking semantic duplicates…");
    expect(f.content.texts()).not.toContain("%");
    f.content.action("discover-duplicates").click(); expect(f.engine.openPotentialDuplicates).toHaveBeenCalledTimes(1);
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("scan").disabled).toBe(true); expect(f.content.action("scan").text).not.toBe("Checking your vault…");
    f.content.action("nav-discover").click(); expect(f.content.action("semantic-health-scan").disabled).toBe(true);
    release([]); await vi.waitFor(() => expect(f.controller.getState().busy).toBe(false));
    expect(f.engine.findPotentialDuplicates).toHaveBeenCalledTimes(1); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.content.action("semantic-health-scan").disabled).toBe(false); await f.view.onClose();
  });

  it("reports partial/failure safely and never starts Health analysis after Build", async () => {
    const f = semanticFixture(true, "not-initialized"); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.action("semantic-health-scan")).toBeUndefined();
    f.content.action("discover-build").click(); await flush();
    expect(f.content.action("semantic-health-scan")).toBeDefined(); expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled();
    f.engine.findPotentialDuplicates.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ leftPath: `${i}.md`, rightPath: "Z.md", score: 0.97, leftMatches: [], rightMatches: [] })));
    f.content.action("semantic-health-scan").click(); await vi.waitFor(() => expect(f.controller.getState().busy).toBe(false));
    expect(f.content.texts()).toContain("Semantic duplicate check had limited results");
    f.engine.findPotentialDuplicates.mockRejectedValueOnce(new Error("PRIVATE_RESPONSE"));
    f.content.action("semantic-health-scan").click(); await vi.waitFor(() => expect(f.controller.getState().busy).toBe(false));
    expect(f.content.texts()).toContain("Semantic duplicate check could not be completed"); expect(f.content.texts()).not.toContain("PRIVATE_RESPONSE");
    await f.view.onClose();
  });

  it("Discover's three Ready workflows delegate once through the port and preserve Finding bytes, lifecycle and Health", async () => {
    const f = semanticFixture(true, "ready", 8); const item = inboxFinding({ state: "dismissed" });
    const bytes = serializeHealth({ version: 1, updatedAt: 10, findings: { [item.id]: item } });
    f.files.set(`${root}/findings.json`, bytes); await f.view.onOpen(); f.content.action("nav-health")?.click();
    const findings = f.controller.listFindings(); const health = f.controller.getState().snapshot;
    const actions = [["search", "openSearch"], ["related", "openSimilarNotes"], ["duplicates", "openPotentialDuplicates"]] as const;
    const delegates = actions.map(([, method]) => vi.spyOn(f.semantic, method));
    f.content.action("nav-discover").click();
    expect(f.content.all().filter((e) => e.tag === "button" && e.attrs["data-health-action"]?.startsWith("discover-")).map((e) => e.attrs["data-health-action"]))
      .toEqual(["discover-search", "discover-related", "discover-duplicates"]);
    for (const [id, method] of actions) {
      const button = f.content.action(`discover-${id}`); expect(button.tag).toBe("button"); button.focus(); button.click();
      expect(f.engine[method]).toHaveBeenCalledExactlyOnceWith();
    }
    for (const delegate of delegates) expect(delegate).toHaveBeenCalledExactlyOnceWith();
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action("state-dismissed").click();
    expect(f.content.action(`finding-${item.id}`)).toBeDefined();
    expect(f.files.get(`${root}/findings.json`)).toBe(bytes); expect(f.controller.listFindings()).toEqual(findings);
    expect(f.controller.getState().snapshot).toEqual(health); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.content.texts()).not.toContain("Ask your Vault"); await f.view.onClose();
  });

  it("disabled Discover reuses Health setup and Back discards edits without network or saves", async () => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Local Health continues to work without it");
    f.content.action("discover-enable").click();
    expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page");
    f.content.action("semantic-mode-cloud").click(); f.content.action("semantic-field-apiKey").input("synthetic-discarded-draft");
    f.content.action("semantic-back").click(); expect(f.content.action("settings-semantic")).toBeDefined();
    f.content.action("nav-discover").click(); f.content.action("discover-enable").click(); f.content.action("semantic-mode-cloud").click();
    expect(f.content.action("semantic-field-apiKey").value === "synthetic-discarded-draft").toBe(false);
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it.each(["not-initialized", "ready"] as const)("%s without vectors builds only on click and updates Discover to Ready", async (kind) => {
    const f = semanticFixture(true, kind); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.action("discover-search").disabled).toBe(true); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(Boolean(f.content.action("discover-check"))).toBe(kind === "not-initialized");
    f.content.action("discover-build").click(); await flush();
    expect(f.engine.indexVault).toHaveBeenCalledExactlyOnceWith(); expect(f.content.action("discover-search")).toBeDefined();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page"); await f.view.onClose();
  });

  it("incompatible Discover rebuilds only on click; Change reuses Health setup", async () => {
    const f = semanticFixture(true, "incompatible", 8); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Index needs rebuilding"); expect(f.content.action("discover-search").disabled).toBe(true);
    expect(f.engine.rebuildIndex).not.toHaveBeenCalled(); f.content.action("discover-change").click();
    expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page"); expect(f.content.action("semantic-mode-local")).toBeDefined();
    f.content.action("semantic-back").click(); f.content.action("nav-discover").click(); f.content.action("discover-rebuild").click();
    await flush(); expect(f.engine.rebuildIndex).toHaveBeenCalledExactlyOnceWith(); await f.view.onClose();
  });

  it("error and busy Discover show safe status, prevent duplicate checks and leave Local Health browsable", async () => {
    const f = semanticFixture(true, "error"); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Semantic Intelligence needs attention");
    expect(f.content.action("discover-change")).toBeDefined(); expect(f.content.action("discover-search").disabled).toBe(true);
    let reject!: (error: Error) => void;
    f.engine.refreshSemanticStatus.mockReturnValueOnce(new Promise((_, rejectOperation) => { reject = rejectOperation; }));
    const check = f.content.action("discover-check"); check.click(); check.click();
    expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1); expect(f.content.action("discover-check")).toBeUndefined();
    expect(f.content.all().find((e) => e.attrs.role === "status")?.text).toBe("Checking Semantic Intelligence…");
    f.content.action("nav-health").click(); expect(f.content.action("scan").disabled).toBe(false);
    f.content.action("nav-discover").click(); reject(new Error("synthetic-private-provider-response")); await flush();
    expect(f.content.texts()).toContain("Semantic Intelligence needs attention"); expect(f.content.texts()).not.toContain("synthetic-private");
    expect(f.scan).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it("Russian Discover localizes navigation/workflows and preserves provider/model identifiers", async () => {
    setLanguage("ru"); const f = semanticFixture(true, "ready", 8); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click();
    expect(f.content.action("nav-discover").texts()).toContain("Разбор хранилища"); expect(f.content.texts()).toContain("Связанные заметки");
    expect(f.content.texts()).toContain("Возможные дубликаты");
    f.content.action("nav-settings").click(); expect(f.content.texts()).toContain(f.settings.get().embeddingModel);
    expect(f.content.texts()).not.toMatch(/@discover|@semantic/u); await f.view.onClose();
  });

  it.each([false, true])("opening Health (enabled %s) never tests, reads notes, indexes or changes the four local dimensions", async (enabled) => {
    const f = semanticFixture(enabled); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.scan).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.content.all().filter((e) => e.attrs["data-dimension"])).toHaveLength(4);
    expect(f.content.action(enabled ? "semantic-check" : "semantic-enable")).toBeUndefined();
    expect(f.content.action("scan").disabled).toBe(false);
    f.content.action("nav-settings").click();
    expect(f.content.action(enabled ? "semantic-check" : "semantic-enable")).toBeDefined();
    if (enabled) { f.content.action("semantic-check").click(); await flush(); expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1); }
    await f.view.onClose();
  });

  it.each(["local", "cloud", "custom"] as const)("choosing/editing %s is transient; Back discards it without side effects", async (mode) => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); const previous = JSON.stringify(f.settings.get());
    f.content.action("semantic-enable").click(); f.content.action(`semantic-mode-${mode}`).click();
    const selected = f.content.action(`semantic-mode-${mode}`); expect(selected.tag).toBe("button");
    expect(selected.attrs["aria-pressed"]).toBe("true"); expect(selected.texts()).toContain("✓ Selected");
    if (mode !== "local") {
      const key = f.content.action("semantic-field-apiKey"); expect(key.attrs.type).toBe("password"); expect(key.attrs.autocomplete).toBe("off");
      key.input("synthetic-draft-key");
    }
    if (mode === "custom") { f.content.action("semantic-field-baseUrl").input("http://localhost:4321/v1"); f.content.action("semantic-field-model").input("edited-model"); }
    f.content.action("semantic-back").click();
    expect(f.content.action("semantic-enable")).toBeDefined(); expect(JSON.stringify(f.settings.get()) === previous).toBe(true);
    expect(f.settings.update.mock.calls.length).toBe(0); expect(mocks.requestUrl).not.toHaveBeenCalled();
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("semantic-enable").click(); f.content.action(`semantic-mode-${mode}`).click();
    if (mode === "custom") expect(f.content.action("semantic-field-model").value).not.toBe("edited-model");
    await f.view.onClose();
  });

  it.each(["local", "cloud", "custom"] as const)("%s Connect reads no notes, says Index required, and waits for a separate Build action", async (mode) => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    f.content.action("semantic-enable").click(); f.content.action(`semantic-mode-${mode}`).click();
    if (mode !== "local") f.content.action("semantic-field-apiKey").input("synthetic-key");
    f.content.action("semantic-connect").click();
    expect(f.content.action("semantic-connect").disabled).toBe(true); expect(f.content.action("semantic-mode-cloud").disabled).toBe(true);
    await vi.waitFor(() => expect(f.content.texts()).toContain("Index required"));
    expect(f.content.texts()).not.toContain("Semantic Intelligence ready"); expect(f.content.action("semantic-search")).toBeUndefined();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(1); expect(f.scan).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.settings.update).toHaveBeenCalledTimes(1);
    expect(f.controller.listFindings()).toEqual([]);
    f.content.action("semantic-build").click(); await vi.waitFor(() => expect(f.content.action("semantic-search")).toBeDefined());
    expect(f.engine.indexVault).toHaveBeenCalledTimes(1); f.content.action("semantic-search").click();
    expect(f.engine.openSearch).toHaveBeenCalledTimes(1); expect(f.scan).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it("existing Ready users search immediately; Change setup and Back retain Ready; Advanced edits are reread", async () => {
    const f = semanticFixture(true, "ready", 8); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    expect(f.content.texts()).toContain("Semantic Intelligence ready"); expect(f.content.texts()).toContain("8 vectors");
    expect(f.content.action("semantic-mode-local")).toBeUndefined(); f.content.action("semantic-search").click();
    f.content.action("semantic-change").click(); f.content.action("semantic-mode-cloud").click(); f.content.action("semantic-back").click();
    expect(f.content.action("semantic-search")).toBeDefined(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    await f.settings.update({ ...f.settings.get(), embeddingModel: "advanced-model" });
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action("nav-settings").click();
    expect(f.content.texts()).toContain("advanced-model"); expect(f.scan).not.toHaveBeenCalled(); expect(mocks.requestUrl).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it("incompatible status offers only explicit rebuild, without Clear or semantic Findings", async () => {
    const f = semanticFixture(true, "incompatible", 8); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    expect(f.content.texts()).toContain("Index needs rebuilding"); expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
    expect(f.content.action("semantic-build")).toBeUndefined(); expect(f.content.texts()).not.toContain("Clear index");
    f.content.action("semantic-rebuild").click(); await flush(); expect(f.engine.rebuildIndex).toHaveBeenCalledTimes(1);
    expect(f.controller.listFindings()).toEqual([]); expect(f.scan).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it("failed tests and saves retain drafts for retry with fixed safe copy", async () => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click(); f.content.action("semantic-enable").click(); f.content.action("semantic-mode-local").click();
    mocks.requestUrl.mockRejectedValueOnce(new Error("private-provider-response")); f.content.action("semantic-connect").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't connect to Ollama"));
    f.settings.update.mockRejectedValueOnce(new Error("private-save-response")); f.content.action("semantic-connect").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Semantic Intelligence settings"));
    expect(f.content.all().find((e) => e.cls.includes("veynrel-semantic"))?.texts()).toContain("Couldn't save Semantic Intelligence settings");
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toBe("");
    expect(f.content.texts()).not.toContain("private-"); expect(f.settings.get().enabled).toBe(false);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it("closing discards the route and subscription; a late Connect cannot reopen it", async () => {
    const f = semanticFixture(); const remove = vi.fn(); const subscribe = f.semantic.subscribe.bind(f.semantic);
    vi.spyOn(f.semantic, "subscribe").mockImplementation((listener) => { const unsubscribe = subscribe(listener); return () => { remove(); unsubscribe(); }; });
    await f.view.onOpen(); f.content.action("nav-settings")?.click(); f.content.action("semantic-enable").click(); f.content.action("semantic-mode-local").click();
    let release!: (value: unknown) => void; mocks.requestUrl.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    f.content.action("semantic-connect").click(); await flush(); await f.view.onClose(); expect(remove).toHaveBeenCalledTimes(1);
    release({ status: 200, text: '{"embeddings":[[1,0,0]]}' }); await flush(); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    expect(f.content.action("semantic-mode-local")).toBeUndefined(); expect(f.content.action("semantic-check")).toBeDefined();
    expect(f.content.texts()).not.toContain("Semantic Intelligence connected"); await f.view.onClose();
  });

  it("Russian setup uses localized copy while preserving provider/model identifiers", async () => {
    setLanguage("ru"); const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-settings")?.click();
    expect(f.content.texts()).toContain("Семантические возможности"); f.content.action("semantic-enable").click();
    for (const mode of ["local", "cloud", "custom"] as const) { f.content.action(`semantic-mode-${mode}`).click(); expect(f.content.texts()).not.toContain("@semantic"); }
    expect(f.content.texts()).toContain("Базовый URL"); expect(f.content.texts()).toContain("OpenAI"); await f.view.onClose();
  });
});

describe("integrated Health onboarding", () => {
  it("asks one question, resumes after reopen without reading notes, scans only on click and keeps one live region", async () => {
    const f = fixture({}); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.texts()).toContain("Welcome to Veynrel");
    expect(f.content.action("nav-findings")).toBeUndefined();
    expect(f.content.action("nav-discover")).toBeUndefined();
    expect(f.content.all().filter((e) => e.tag === "button" && e.attrs["data-health-action"]?.startsWith("profile-"))).toHaveLength(5);
    expect(f.content.action("scan")).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    const live = f.content.all().find((e) => e.attrs.role === "status");
    const choice = f.content.action("profile-research"); choice.focus(); choice.click();
    await vi.waitFor(() => expect(f.content.action("scan")).toBeDefined());
    expect(f.preferences.get()).toMatchObject({ profile: "research", profileChosen: true, onboardingCompleted: false });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    expect(f.content.all().find((e) => e.attrs.role === "status")).toBe(live);
    expect(f.content.ownerDocument.activeElement?.tag).toBe("h1");
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("scan")).toBeDefined(); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("scan").click(); const pending = f.controller.runLocalScan();
    expect(f.preferences.get().onboardingCompleted).toBe(false); await pending;
    expect(f.content.texts()).toContain("Veynrel found something"); expect(f.content.texts()).toContain("Note without connections");
    expect(f.content.action("continue")).toBeDefined(); expect(f.content.action("nav-tools")).toBeUndefined();
    expect(f.content.action("nav-findings")).toBeUndefined();
    expect(f.preferences.get().onboardingCompleted).toBe(false);
    f.content.action("continue").click(); await vi.waitFor(() => expect(f.content.action("nav-tools")).toBeDefined());
    expect(f.preferences.get().onboardingCompleted).toBe(true); f.content.action("nav-health").click(); expect(f.vault.read).toHaveBeenCalledTimes(1);
    expect(f.content.action("nav-findings")).toBeDefined();
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); expect(f.content.action("nav-tools")).toBeDefined();
    expect(f.content.all().filter((e) => e.attrs.role === "status")).toHaveLength(1);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
  });
  it("Skip saves Mixed, permanently exits onboarding and never scans", async () => {
    const f = fixture({}); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("skip").click();
    await vi.waitFor(() => expect(f.content.action("nav-tools")).toBeDefined());
    expect(f.preferences.get()).toEqual({ profile: "mixed", profileChosen: true, onboardingCompleted: true, onboardingVersion: 1 });
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); expect(f.content.action("skip")).toBeUndefined();
    expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("migrating an existing scan uses it immediately after profile selection and derives Result after restart", async () => {
    const f = fixture({}); await f.controller.runLocalScan(); f.controller.dispose(); f.vault.read.mockClear();
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const view = new VeynrelHealthView({ app: f.app } as never, controller, f.tools); await view.onOpen(); (view.contentEl as unknown as InstanceType<typeof mocks.Element>).action("nav-health")?.click();
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.texts()).toContain("Welcome"); content.action("profile-work").click();
    await vi.waitFor(() => expect(content.action("continue")).toBeDefined());
    expect(content.action("scan")).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    await view.onClose(); controller.dispose();
    const restarted = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const reopened = new VeynrelHealthView({ app: f.app } as never, restarted, f.tools); await reopened.onOpen();
    expect((reopened.contentEl as unknown as InstanceType<typeof mocks.Element>).action("continue")).toBeDefined();
    expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("safe errors retain Profile or Result when choice, Skip or completion fails", async () => {
    const f = fixture({}); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.save.mockRejectedValue(new Error("private details"));
    f.content.action("profile-work").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toContain("Couldn't save Health preferences");
    expect(f.content.action("profile-work")).toBeDefined(); expect(f.preferences.get().profileChosen).toBe(false);
    f.content.action("skip").click(); await flush(); expect(f.preferences.get().onboardingCompleted).toBe(false);
    expect(f.content.texts()).not.toContain("private details");
    const result = fixture({ profileChosen: true }); await result.view.onOpen(); await result.controller.runLocalScan();
    result.save.mockRejectedValueOnce(new Error("private details")); result.content.action("continue").click();
    await vi.waitFor(() => expect(result.content.texts()).toContain("Couldn't save Health preferences"));
    expect(result.content.action("continue")).toBeDefined(); expect(result.content.action("nav-tools")).toBeUndefined();
    expect(result.preferences.get().onboardingCompleted).toBe(false); expect(result.content.texts()).not.toContain("private details");
    result.content.action("continue").click(); await vi.waitFor(() => expect(result.content.action("nav-tools")).toBeDefined());
  });
  it("Change profile is secondary, shows a non-color selected marker, has no Skip and never scans", async () => {
    const f = fixture({ profile: "work", profileChosen: true, onboardingCompleted: true }); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("nav-settings").click(); f.content.action("change-profile").click();
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-work").texts()).toContain("✓ Selected"); expect(f.content.action("skip")).toBeUndefined();
    f.save.mockRejectedValueOnce(new Error("private detail")); f.content.action("profile-research").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toContain("Couldn't save Health preferences");
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-research").attrs["aria-pressed"]).toBe("false");
    f.content.action("profile-research").click(); await vi.waitFor(() => expect(f.content.action("profile-research")).toBeUndefined());
    expect(f.content.texts()).toContain("Profile: Research & writing");
    expect(f.preferences.get().onboardingCompleted).toBe(true); f.content.action("nav-health").click(); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("nav-tools").click(); expect(f.content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
  });
  it.each(["findings.json", "scan-runs.json"])("recovery of %s wins before Welcome and preserves preferences", async (file) => {
    const f = fixture({ profile: "research" }); f.files.set(`${root}/${file}`, "{bad"); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("profile-research")).toBeUndefined();
    const preferences = f.preferences.get(); f.content.action("recover").click();
    mocks.Modal.opened[0].contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Welcome"));
    expect(f.preferences.get()).toEqual(preferences); expect(f.save).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("Russian first-result copy localizes the selected Finding while retaining its stored text", async () => {
    setLanguage("ru"); const f = fixture({ profileChosen: true }); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.controller.runLocalScan();
    expect(f.content.texts()).toContain("Заметка без связей"); expect(f.content.texts()).not.toContain("Note has no");
    const finding = f.controller.getState().recommendationFinding!;
    expect(finding.title).not.toMatch(/[А-Яа-яЁё]/u); expect(f.content.action("continue").text).toBe("Перейти к состоянию");
  });
});

describe("navigation and registration", () => {
  it("reveals deferred existing leaves without inspecting their view", async () => {
    const leaf = { get view(): never { throw new Error("Deferred view accessed"); } };
    const workspace = { getLeavesOfType: vi.fn(() => [leaf]), getLeaf: vi.fn(), revealLeaf: vi.fn(async (_leaf: unknown) => undefined) };
    await openHealthView(workspace as never); expect(workspace.getLeaf).not.toHaveBeenCalled(); expect(workspace.revealLeaf).toHaveBeenCalledTimes(1); expect(workspace.revealLeaf.mock.calls[0][0]).toBe(leaf);
  });
  it("creates a main tab, sets its type, then reveals it", async () => {
    const calls: string[] = [];
    const leaf = { setViewState: vi.fn(async () => { calls.push("state"); }) };
    const workspace = { getLeavesOfType: () => [], getLeaf: vi.fn(() => leaf), revealLeaf: vi.fn(async () => { calls.push("reveal"); }) };
    await openHealthView(workspace as never);
    expect(workspace.getLeaf).toHaveBeenCalledWith("tab"); expect(leaf.setViewState).toHaveBeenCalledWith({ type: "veynrel-health", active: true });
    expect(calls).toEqual(["state", "reveal"]);
  });
  it("ribbon and new command share one opening path; registration does not initialize or scan", async () => {
    const f = appFixture(); const leaf = { setViewState: vi.fn(async () => undefined) };
    const workspace = { getLeavesOfType: vi.fn(() => [] as typeof leaf[]), getLeaf: vi.fn(() => leaf), revealLeaf: vi.fn(async (_leaf: unknown) => undefined) };
    Object.assign(f.app, { workspace });
    const plugin = { app: f.app, manifest: { id: "ai-knowledge-hub" }, registerView: vi.fn(), register: vi.fn(),
      addRibbonIcon: vi.fn(), addCommand: vi.fn() };
    registerHealth(plugin as never, toolsFixture(), preferencesFixture().preferences);
    expect(f.adapter.exists).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    const ribbon = plugin.addRibbonIcon.mock.calls[0][2] as () => void;
    const command = plugin.addCommand.mock.calls[0][0] as { id: string; callback: () => void };
    expect(command.id).toBe("veynrel-open-health"); expect(command.callback).toBe(ribbon);
    ribbon(); command.callback(); ribbon(); await flush(); expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
    workspace.getLeavesOfType.mockReturnValue([leaf]); ribbon(); await flush(); expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
  });
  it("Open note accepts only existing, canonical, in-scope Markdown files", async () => {
    const f = fixture();
    for (const path of [undefined, "../A.md", "/A.md", "Private/Config/secret.md"]) expect(await openHealthNote(f.app, path)).toBe(false);
    expect(f.openFile).not.toHaveBeenCalled();
    expect(await openHealthNote(f.app, "A.md")).toBe(true); expect(f.openFile).toHaveBeenCalledTimes(1);
    const attachment = new mocks.TFile(); attachment.extension = "pdf"; f.vault.getAbstractFileByPath.mockReturnValue(attachment);
    expect(await openHealthNote(f.app, "A.md")).toBe(false);
  });
  it("confirmation cannot run twice and never confirms merely by opening", () => {
    const confirmed = vi.fn(); const modal = new HealthRecoveryModal({} as never, "history", confirmed); modal.open();
    expect(confirmed).not.toHaveBeenCalled(); const content = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.texts()).toContain("Findings will be preserved"); const button = content.all().find((e) => e.text === "Back up and reset")!;
    button.click(); button.click(); expect(confirmed).toHaveBeenCalledTimes(1);
  });
});

describe("Findings navigation and lifecycle integration", () => {
  async function scanned() {
    const f = fixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.controller.runLocalScan();
    f.vault.read.mockClear(); f.vault.getMarkdownFiles.mockClear(); f.adapter.write.mockClear();
    return f;
  }
  it("Health summary/top navigation, card filters, recommendation detail and Back never scan", async () => {
    const f = await scanned(); const id = f.controller.getState().recommendationFinding!.id;
    f.content.action("view-findings").click();
    expect(f.content.action("nav-findings").attrs["aria-current"]).toBe("page");
    expect(f.content.action("state-open").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("filter-all").attrs["aria-pressed"]).toBe("true");
    f.content.action("nav-health").click(); f.content.action("dimension-structure").click();
    expect(f.content.action("filter-structure").attrs["aria-pressed"]).toBe("true");
    f.content.action("nav-health").click(); f.content.action("dimension-connections").click();
    expect(f.content.action("filter-connections").attrs["aria-pressed"]).toBe("true");
    expect(f.content.texts()).toContain("No open findings");
    f.content.action("nav-health").click();
    expect(f.content.action("dimension-recall")).toBeUndefined(); expect(f.content.action("dimension-knowledge")).toBeUndefined();
    expect(f.content.action("open-note")).toBeDefined(); f.content.action("review-finding").click();
    expect(f.content.texts()).toContain("Why Veynrel found this"); expect(f.content.action(`finding-${id}`).attrs["aria-pressed"]).toBe("true");
    expect(f.content.ownerDocument.activeElement?.attrs["data-findings-heading"]).toBe("true");
    f.content.action("findings-back").click(); expect(f.content.action("finding-dismiss")).toBeUndefined();
    expect(f.content.ownerDocument.activeElement?.tag).toBe("h1");
    for (const dimension of ["recall", "knowledge", "all"]) f.content.action(`filter-${dimension}`).click();
    const row = f.content.action(`finding-${id}`); row.focus(); row.click();
    expect(f.content.ownerDocument.activeElement?.tag).toBe("h2");
    f.content.action("tools").click(); expect(f.content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(f.content.action("tools")).toBeUndefined();
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
    f.content.action("nav-health").click(); expect(f.content.action("scan")).toBeDefined();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });
  it("Dismiss -> Dismissed -> Reopen -> Snooze -> Snoozed -> Reopen updates Home immediately without scans or preference/history writes", async () => {
    const f = await scanned(); const id = f.controller.listFindings()[0].id;
    f.content.action("review-finding").click(); f.content.action("finding-dismiss").click();
    await vi.waitFor(() => expect(f.controller.getFinding(id)?.state).toBe("dismissed"));
    expect(f.content.action("finding-dismiss")).toBeUndefined(); expect(f.content.action(`finding-${id}`)).toBeUndefined();
    expect(f.content.texts()).toContain("Finding updated");
    f.content.action("nav-health").click();
    expect(f.content.texts()).toContain("No open findings"); expect(f.content.action("review-finding")).toBeUndefined();
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action("state-dismissed").click(); f.content.action(`finding-${id}`).click();
    f.content.action("finding-reopen").click(); await vi.waitFor(() => expect(f.controller.getFinding(id)?.state).toBe("open"));
    expect(f.content.action("finding-reopen")).toBeUndefined();
    f.content.action("state-open").click(); f.content.action(`finding-${id}`).click(); f.content.action("finding-snooze").click();
    for (const days of [1, 7, 30]) expect(f.content.action(`snooze-${days}`)).toBeDefined();
    const before = Date.now(); f.content.action("snooze-7").click();
    await vi.waitFor(() => expect(f.controller.getFinding(id)?.state).toBe("snoozed"));
    expect(f.controller.getFinding(id)!.snoozedUntil).toBeGreaterThanOrEqual(before + 7 * 86_400_000);
    expect(f.content.action(`finding-${id}`)).toBeUndefined(); expect(f.controller.getState().snapshot?.recommendation).toBeUndefined();
    f.content.action("state-snoozed").click(); f.content.action(`finding-${id}`).click();
    expect(f.content.texts()).toContain("Snoozed until"); f.content.action("finding-reopen").click();
    await vi.waitFor(() => expect(f.controller.getFinding(id)?.state).toBe("open"));
    f.content.action("nav-health").click(); expect(f.content.action("review-finding")).toBeDefined();
    expect(f.content.texts()).toContain("Open findings: 1");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(f.adapter.write.mock.calls.map(([path]) => path)).toEqual(Array(4).fill(`${root}/findings.json`));
  });
  it("keeps detail and row until persistence succeeds, disables stale/double clicks and reports safe failure", async () => {
    const f = await scanned(); const id = f.controller.listFindings()[0].id;
    f.content.action("review-finding").click();
    let reject!: (error: Error) => void; f.adapter.write.mockReturnValueOnce(new Promise((_, rejectWrite) => { reject = rejectWrite; }));
    const dismiss = f.content.action("finding-dismiss"); dismiss.focus(); dismiss.click(); dismiss.click(); await flush();
    expect(f.content.action(`finding-${id}`)).toBeDefined(); expect(f.content.action("finding-dismiss").disabled).toBe(true);
    expect(f.controller.getFinding(id)?.state).toBe("open"); expect(f.adapter.write).toHaveBeenCalledTimes(1);
    reject(new Error("PRIVATE FAILURE")); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't update this finding"));
    expect(f.content.texts()).not.toContain("PRIVATE"); expect(f.content.action("finding-dismiss").disabled).toBe(false);
    expect(f.content.action(`finding-${id}`)).toBeDefined(); expect(f.controller.getFinding(id)?.state).toBe("open");
    f.content.action("finding-dismiss").click(); await vi.waitFor(() => expect(f.content.action("finding-dismiss")).toBeUndefined());
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  async function failedDismiss() {
    const f = await scanned(); const id = f.controller.listFindings()[0].id;
    const bytes = f.files.get(`${root}/findings.json`);
    f.content.action("review-finding").click(); f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE STORAGE ERROR"));
    f.content.action("finding-dismiss").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't update this finding."));
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toContain("Couldn't update this finding.");
    expect(f.controller.getFinding(id)?.state).toBe("open"); expect(f.files.get(`${root}/findings.json`)).toBe(bytes);
    expect(f.content.texts()).not.toContain("PRIVATE"); expect(JSON.stringify(f.controller.getState())).not.toContain("PRIVATE");
    return { ...f, id };
  }
  it("leaving a failed Dismiss for Health clears the error and returning to the same Finding never resurrects it", async () => {
    const f = await failedDismiss(); f.content.action("nav-health").click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.content.texts()).toContain("Vault check complete");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    f.content.action(`finding-${f.id}`).click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  it.each(["state-dismissed", "filter-connections", "another-finding"])("%s ends the failed interaction without resurrecting its status on return", async (destination) => {
    const f = fixture(); f.vault.getMarkdownFiles.mockReturnValue([f.note, { ...f.note, path: "B.md", basename: "B" }]);
    await f.view.onOpen(); f.content.action("nav-health")?.click(); await f.controller.runLocalScan();
    const id = f.controller.getState().recommendationFinding!.id;
    const other = f.controller.listFindings().find((finding) => finding.id !== id)!;
    f.content.action("review-finding").click(); f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE STORAGE ERROR"));
    f.content.action("finding-dismiss").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't update this finding."));
    f.content.action(destination === "another-finding" ? `finding-${other.id}` : destination).click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action(`finding-${id}`).click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding."); expect(f.controller.getFinding(id)?.state).toBe("open");
  });
  it("a later scan clears a failed Finding interaction immediately and can publish its own successful status", async () => {
    const f = await failedDismiss();
    const pending = f.controller.runLocalScan();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.content.texts()).toContain("Checking your vault…"); await pending;
    expect(f.content.texts()).toContain("Vault check complete"); expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.controller.getFinding(f.id)?.state).toBe("open"); expect(f.content.action("finding-dismiss")).toBeDefined();
  });
  it("a second lifecycle interaction can fail safely and then succeed after leaving the first failure", async () => {
    const f = await failedDismiss(); f.content.action("findings-back").click(); f.content.action(`finding-${f.id}`).click();
    f.content.action("finding-snooze").click(); f.adapter.write.mockRejectedValueOnce(new Error("SECOND PRIVATE FAILURE"));
    f.content.action("snooze-1").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't update this finding."));
    expect(f.controller.getFinding(f.id)?.state).toBe("open");
    expect(f.content.texts()).not.toContain("PRIVATE"); expect(JSON.stringify(f.controller.getState())).not.toContain("PRIVATE");
    f.content.action("snooze-1").click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    await vi.waitFor(() => expect(f.controller.getFinding(f.id)?.state).toBe("snoozed"));
    expect(f.content.texts()).not.toContain("Couldn't update this finding."); expect(f.content.texts()).toContain("Finding updated");
  });
  it.each(["navigation", "close"])("a pending failure cannot restore an abandoned interaction after %s and return", async (leave) => {
    const f = await scanned(); const id = f.controller.listFindings()[0].id; f.content.action("review-finding").click();
    let reject!: (error: Error) => void; f.adapter.write.mockReturnValueOnce(new Promise((_, rejectWrite) => { reject = rejectWrite; }));
    f.content.action("finding-dismiss").click(); await flush();
    if (leave === "navigation") f.content.action("nav-health").click();
    else { await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); }
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action(`finding-${id}`).click();
    reject(new Error("PRIVATE LATE FAILURE")); await vi.waitFor(() => expect(f.controller.getState().mutatingFindingId).toBeUndefined()); await flush();
    expect(f.controller.getFinding(id)?.state).toBe("open"); expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.content.texts()).not.toContain("PRIVATE"); expect(JSON.stringify(f.controller.getState())).not.toContain("PRIVATE");
  });
  it("reacts to external scan resolution and recurrence, announces it and offers no manual Reopen for history", async () => {
    const f = await scanned(); const item = f.controller.listFindings()[0];
    f.content.action("review-finding").click(); f.vault.getMarkdownFiles.mockReturnValue([]); await f.controller.runLocalScan();
    expect(f.content.texts()).toContain("Finding was resolved by the latest scan"); expect(f.content.action("findings-back")).toBeUndefined();
    f.content.action("state-resolved").click(); f.content.action(`finding-${item.id}`).click();
    expect(f.content.action("finding-reopen")).toBeUndefined(); expect(f.content.action("finding-dismiss")).toBeUndefined(); expect(f.content.action("finding-snooze")).toBeUndefined();
    f.vault.getMarkdownFiles.mockReturnValue([f.note]); await f.controller.runLocalScan();
    expect(f.content.action("findings-back")).toBeUndefined(); f.content.action("state-open").click();
    expect(f.content.action(`finding-${item.id}`)).toBeDefined(); expect(f.controller.getFinding(item.id)?.firstSeenAt).toBe(item.firstSeenAt);
  });
  it("revalidates each path at click time; missing/unsafe notes and persisted actions never mutate Findings", async () => {
    const f = fixture(); const item = inboxFinding({ notePaths: ["A.md", "Private/Config/Secret.md"],
      actions: [{ kind: "delete", path: "A.md" }, { kind: "fix-link", path: "A.md" }] });
    f.files.set(`${root}/findings.json`, serializeHealth({ version: 1, updatedAt: 10, findings: { [item.id]: item } }));
    await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action(`finding-${item.id}`).click();
    const before = f.controller.listFindings(); f.content.action("finding-note-0").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.content.action("finding-note-1").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.vault.getAbstractFileByPath.mockReturnValue(null); f.content.action("finding-note-0").click(); await flush();
    expect(f.content.texts()).toContain("This note is no longer available"); expect(f.controller.listFindings()).toEqual(before);
    expect(f.content.texts()).not.toMatch(/fix-link|Delete|Fix automatically/u); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
  });
  it("bounds representative paths to ten, expands/collapses them, resets expansion and route when reopened", async () => {
    const f = fixture(); const item = inboxFinding({ type: "exact-duplicate-group", notePaths: Array.from({ length: 100 }, (_, i) => `Note${i}.md`),
      evidence: [{ kind: "member-count", value: 105 }, { kind: "represented-path-count", value: 100 }] });
    f.files.set(`${root}/findings.json`, serializeHealth({ version: 1, updatedAt: 10, findings: { [item.id]: item } }));
    await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-health").click(); f.content.action("nav-findings").click(); f.content.action(`finding-${item.id}`).click();
    expect(f.content.texts()).toContain("105 notes affected"); expect(f.content.texts()).toContain("Showing 100 representative paths");
    expect(f.content.action("finding-note-9")).toBeDefined(); expect(f.content.action("finding-note-10")).toBeUndefined();
    f.content.action("finding-paths").click(); expect(f.content.action("finding-note-99")).toBeDefined();
    f.content.action("finding-paths").click(); expect(f.content.action("finding-note-10")).toBeUndefined();
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); expect(f.content.action("view-findings")).toBeDefined(); expect(f.content.action("finding-dismiss")).toBeUndefined();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
  });
  it.each(["findings.json", "scan-runs.json"])("%s recovery dominates completed onboarding and prevents Inbox navigation", async (file) => {
    const f = fixture(); f.files.set(`${root}/${file}`, "invalid"); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action("recover")).toBeDefined(); expect(f.content.action("nav-findings")).toBeUndefined();
    expect(f.content.action("nav-discover")).toBeUndefined();
    expect(f.content.action("view-findings")).toBeUndefined(); expect(f.content.action("dimension-structure")).toBeUndefined();
  });
});


describe("Connect view boundaries", () => {
  function connectFixture(enabled = true) {
    let current: CompanionSettings = { enabled, endpoint: "http://127.0.0.1:27124", token: "PRIVATE_CONNECT_TOKEN",
      timeoutMs: 5000, vaultId: "22222222-2222-4222-8222-222222222222" };
    let status: CompanionConnectionStatus = { kind: "idle" };
    const listeners = new Set<() => void>(), engineListeners = new Set<() => void>();
    const settings = { get: () => ({ ...current }), update: vi.fn(async (next: Pick<CompanionSettings, "enabled"> & Partial<CompanionSettings>) => {
      current = { ...current, ...next }; for (const listener of listeners) listener(); return { ...current };
    }), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    const engine = { getStatus: () => ({ ...status }), test: vi.fn(async (_settings: CompanionSettings) => {}),
      syncCurrent: vi.fn(async () => "synced" as const), getSemanticMirrorState: () => ({ enabled: true, cachedReady: true }),
      openProposalReview: vi.fn(), subscribeStatus: (listener: () => void) => { engineListeners.add(listener); return () => { engineListeners.delete(listener); }; } };
    const connect = new ConnectController(settings, engine);
    const f = fixture(undefined, undefined, undefined, undefined, undefined, connect);
    const second = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, undefined, undefined, undefined, undefined, connect);
    return { ...f, settings, engine, connect, second, secondContent: second.contentEl as unknown as InstanceType<typeof mocks.Element>,
      publish: (next: CompanionConnectionStatus) => { status = next; for (const listener of engineListeners) listener(); } };
  }
  function passive(f: ReturnType<typeof connectFixture>, openedViews = 1) {
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(openedViews);
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(f.engine.syncCurrent).not.toHaveBeenCalled(); expect(f.engine.openProposalReview).not.toHaveBeenCalled();
  }
  it.each(["en", "ru"] as const)("disabled Connect owns its visible status in %s", async (language) => {
    setLanguage(language); const f = connectFixture(false); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("nav-settings").click(); f.content.action("settings-connect").click();
    const live = f.content.all().find((e) => e.attrs.role === "status")!;
    expect(live.text).toBe(t("@connect.state.disabled"));
    expect(live.attrs).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" });
    expect(f.content.all().find((e) => e.cls.includes("veynrel-connect"))?.texts()).toContain(t("@connect.state.disabled"));
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toBe("");
    passive(f); await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("Connect opens passively with localized capabilities, credential distinction and no direct writes in %s", async (language) => {
    setLanguage(language); const f = connectFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    f.content.action("nav-settings").click(); f.content.action("settings-connect").click(); passive(f); expect(f.engine.test).not.toHaveBeenCalled();
    expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page");
    expect(f.content.texts()).not.toMatch(/@connect|PRIVATE_CONNECT_TOKEN|22222222/u);
    expect(f.content.texts()).toContain(language === "en" ? "They do not read live Obsidian memory" : "не имеют доступа к текущему состоянию Obsidian");
    expect(f.content.texts()).toContain(language === "en" ? "does not delete data already stored" : "не удаляет уже сохранённые");
    expect(f.content.texts()).toContain(language === "en" ? "Only explicit review and approval" : "только после явного просмотра и одобрения");
    expect(f.content.texts()).toContain(language === "en" ? "MCP clients authenticate to Companion separately" : "MCP-клиенты проходят отдельную аутентификацию");
    f.content.action("connect-review").click(); expect(f.engine.openProposalReview).toHaveBeenCalledTimes(1);
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("Sync now discloses exact data, Cancel/navigation/detached confirm do no work, and confirmation is single flight", async () => {
    const f = connectFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-settings").click(); f.content.action("settings-connect").click();
    f.content.action("connect-sync").click(); passive(f);
    expect(f.content.ownerDocument.activeElement?.attrs["data-connect-confirmation"]).toBe("true");
    for (const text of ["Stable Vault identity", "Vault-relative", "Markdown content", "Chunk text", "source metadata", "Embeddings", "Semantic descriptor"])
      expect(f.content.texts()).toContain(text);
    const stale = f.content.action("connect-sync-confirm"); f.content.action("connect-sync-cancel").click(); stale.click(); passive(f);
    f.content.action("connect-sync").click(); const detached = f.content.action("connect-sync-confirm");
    f.content.action("nav-health").click(); f.content.action("nav-findings").click(); detached.click(); passive(f);
    f.content.action("nav-settings").click(); f.content.action("settings-connect").click(); expect(f.content.action("connect-sync-confirm")).toBeUndefined();
    f.content.action("connect-sync").click(); const confirm = f.content.action("connect-sync-confirm"); confirm.click(); confirm.click(); await flush();
    expect(f.engine.syncCurrent).toHaveBeenCalledTimes(1); expect(f.vault.read).not.toHaveBeenCalled();
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("Remote form discloses storage before enabling, uses password-only token and clears token on server changes", async () => {
    const f = connectFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-settings").click(); f.content.action("settings-connect").click(); f.content.action("connect-setup").click();
    f.content.action("connect-mode-remote").click();
    expect(f.content.action("connect-field-token").value).toBe("");
    expect(f.content.texts()).toContain("transmitted to and stored by the configured remote Companion server");
    f.content.action("connect-field-endpoint").input("https://remote.example");
    const password = f.content.action("connect-field-token");
    expect(password.attrs).toMatchObject({ type: "password", autocomplete: "off" });
    password.input("candidate-private");
    f.content.action("connect-field-endpoint").input("https://another.example"); expect(password.value).toBe("");
    password.input("candidate-private"); f.content.action("connect-submit").click(); await flush();
    expect(f.engine.test).toHaveBeenCalledTimes(1); expect(f.content.texts()).toContain("Connected");
    expect(f.content.all().some((element) => element.value.includes("private"))).toBe(false);
    f.content.action("connect-sync").click(); expect(f.content.texts()).toContain("transmitted to and stored"); passive(f);
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("failed setup retains the form and safe error; late success after navigation never restores it", async () => {
    const f = connectFixture(false); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-settings").click(); f.content.action("settings-connect").click();
    f.content.action("connect-setup").click(); f.content.action("connect-mode-local").click();
    expect(f.content.action("connect-field-endpoint")).toBeUndefined();
    f.engine.test.mockRejectedValueOnce(new Error("PRIVATE_CONNECT_TOKEN raw response"));
    f.content.action("connect-submit").click(); await flush();
    expect(f.content.action("connect-field-token").value).toBe("PRIVATE_CONNECT_TOKEN");
    expect(f.content.texts()).not.toMatch(/PRIVATE_CONNECT_TOKEN|raw response/u); expect(f.settings.update).not.toHaveBeenCalled();
    expect(f.content.all().find((e) => e.cls.includes("veynrel-connect"))?.all().some((e) => e.cls === "veynrel-health-status-error" && Boolean(e.text))).toBe(true);
    expect(f.content.querySelector("[data-workspace-message]")?.texts()).toBe("");
    let release!: () => void; f.engine.test.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    f.content.action("connect-submit").click(); f.content.action("nav-health").click(); release(); await flush();
    expect(f.content.action("connect-field-token")).toBeUndefined();
    f.content.action("nav-settings").click(); f.content.action("settings-connect").click(); expect(f.content.texts()).toContain("Connected");
    expect(f.content.action("connect-field-token")).toBeUndefined();
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("two views share status and one Check; closing one leaves the other subscribed", async () => {
    const f = connectFixture(); await Promise.all([f.view.onOpen(), f.second.onOpen()]); f.content.action("nav-health")?.click(); f.secondContent.action("nav-health")?.click();
    f.content.action("nav-settings").click(); f.content.action("settings-connect").click(); f.secondContent.action("nav-settings").click(); f.secondContent.action("settings-connect").click(); passive(f, 2);
    let release!: () => void; f.engine.test.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    f.content.action("connect-check").click(); expect(f.secondContent.action("connect-check").disabled).toBe(true);
    release(); await flush(); expect(f.content.texts()).toContain("Connected"); expect(f.secondContent.texts()).toContain("Connected");
    expect(f.engine.test).toHaveBeenCalledTimes(1); await f.view.onClose();
    f.publish({ kind: "syncing", operation: "sync" }); expect(f.secondContent.texts()).toContain("Synchronizing…");
    f.publish({ kind: "error", code: "AUTH_REQUIRED" }); expect(f.secondContent.texts()).toContain("Companion rejected the token");
    expect(f.content.children).toHaveLength(0); await f.second.onClose(); f.connect.dispose(); f.controller.dispose();
  });
});

describe("final Tools and Settings IA", () => {
  function overviewFixture(initial?: Partial<HealthPreferences>) {
    const deep = {
      getSnapshot: vi.fn<DeepIntelligencePort["getSnapshot"]>(() => ({ state: "configured", provider: "ollama", providerLabel: "Ollama", model: "deep-fixture", busy: false })),
      getProviders: () => [{ id: "ollama", label: "Ollama", requiresApiKey: false }], createDraft: vi.fn(), connect: vi.fn(), checkCurrentSetup: vi.fn(), subscribe: () => vi.fn(),
    } satisfies DeepIntelligencePort;
    const semantic = {
      getSnapshot: vi.fn<SemanticIntelligencePort["getSnapshot"]>(() => ({ enabled: true, state: "ready", provider: "ollama", providerLabel: "Ollama", model: "semantic-fixture", vectorCount: 42, indexRequired: false, busy: false })),
      createDraft: vi.fn(), connect: vi.fn(), checkCurrentSetup: vi.fn(), buildIndex: vi.fn(), rebuildIndex: vi.fn(), openSearch: vi.fn(), openSimilarNotes: vi.fn(), openPotentialDuplicates: vi.fn(), subscribe: () => vi.fn(),
    } satisfies SemanticIntelligencePort;
    const connect = {
      getSnapshot: vi.fn<ConnectPort["getSnapshot"]>(() => ({ state: "configured", enabled: true, busy: false, local: false, endpointLabel: "PRIVATE_ENDPOINT", semanticEnabled: true, semanticReady: true, mirrorKnownReady: false })),
      createDraft: vi.fn(), connect: vi.fn(), check: vi.fn(), createSyncConfirmation: vi.fn(), sync: vi.fn(), disable: vi.fn(), openProposalReview: vi.fn(), subscribe: () => vi.fn(),
    } satisfies ConnectPort;
    const recall = productFixture().product;
    const f = fixture(initial, semantic, undefined, deep, undefined, connect, recall);
    const work = [vi.spyOn(recall, "initialize"), vi.spyOn(recall, "refreshCards"), vi.spyOn(recall, "startSession"),
      vi.spyOn(f.controller, "runLocalScan"), vi.spyOn(f.controller, "runSemanticScan"), vi.spyOn(f.controller, "runDeepScan"),
      semantic.connect, semantic.checkCurrentSetup, semantic.buildIndex, semantic.rebuildIndex, semantic.openSearch, semantic.openSimilarNotes, semantic.openPotentialDuplicates,
      deep.connect, deep.checkCurrentSetup, connect.connect, connect.check, connect.sync, connect.disable, connect.openProposalReview];
    Object.assign(f.vault, { cachedRead: vi.fn(), modify: vi.fn(), create: vi.fn() });
    return { ...f, deep, semantic, connect, recall, work };
  }
  function passive(f: ReturnType<typeof overviewFixture>) {
    for (const operation of f.work) expect(operation).not.toHaveBeenCalled();
    expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    for (const name of ["read", "cachedRead", "modify", "create"] as const) expect(Reflect.get(f.vault, name)).not.toHaveBeenCalled();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(mocks.requestUrl).not.toHaveBeenCalled();
  }
  it.each(["en", "ru"] as const)("renders final navigation, passive Tools and safe Settings in %s", async (language) => {
    setLanguage(language); mocks.requestUrl.mockClear(); const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("nav-")).map((e) => e.attrs["data-health-action"]))
      .toEqual(["nav-home", "nav-discover", "nav-health", "nav-process", "nav-recall", "nav-tools", "nav-history", "nav-settings", "nav-findings"]);
    for (const page of ["tools", "settings"] as const) {
      f.content.action(`nav-${page}`).click(); passive(f);
      expect(f.content.action(`nav-${page}`).attrs["aria-current"]).toBe("page");
      expect(f.content.ownerDocument.activeElement?.attrs["data-health-heading"]).toBe("true");
      expect(f.content.texts()).not.toMatch(/@(?:tools|settings|deep|semantic|connect)|PRIVATE_ENDPOINT|AI Hub|Vault Audit AI/u);
      expect(f.content.all().filter((e) => e.attrs["data-health-action"]).every((e) => e.tag === "button" || e.tag === "summary" || e.tag === "select" && e.attrs["data-health-action"] === "scope-picker" && Boolean(e.attrs["aria-label"]))).toBe(true);
    }
    expect(f.content.texts()).toContain("deep-fixture"); expect(f.content.texts()).toContain("semantic-fixture"); expect(f.content.texts()).toContain("42");
    expect(f.content.texts()).toContain(language === "en" ? "Configured" : "Настроено");
    expect(f.content.texts()).toContain(language === "en" ? "Local scheduling" : "Локальное планирование");
    expect(f.content.texts()).toContain(language === "en" ? "Settings → Community plugins → Veynrel" : "настройки Obsidian → Сторонние плагины → Veynrel");
    expect(f.content.all().some((e) => e.tag === "input")).toBe(false);
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("each Tools action invokes one host operation and editor entries never guess an editor", async () => {
    const f = overviewFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-tools").click();
    expect(f.content.texts()).toContain("command palette"); expect(f.content.texts()).toContain("Single Audit");
    expect(f.content.texts()).toContain("Knowledge Health"); expect(f.content.texts()).toContain("backups");
    const actions = f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("tool-"));
    expect(actions).toHaveLength(7);
    for (const [name, operation] of Object.entries(f.tools)) {
      f.content.action(`tool-${name}`).click(); await flush(); expect(operation).toHaveBeenCalledTimes(1);
    }
    for (const operation of Object.values(f.tools)) expect(operation).toHaveBeenCalledTimes(1);
    passive(f); expect(f.controller.listFindings()).toEqual([]);
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("Settings reuses the existing setup choosers and Connect route without setup or IO on entry", async () => {
    const f = overviewFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    for (const kind of ["deep", "semantic", "connect"] as const) {
      f.content.action("nav-settings").click(); f.content.action(`settings-${kind}`).click();
      expect(f.content.action(kind === "deep" ? "deep-provider-ollama" : kind === "semantic" ? "semantic-mode-local" : "connect-check")).toBeDefined();
      expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page");
      passive(f);
    }
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("two views keep independent routes and share launchers; late errors cannot resurrect a route", async () => {
    const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    const second = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, f.semantic, f.recall, f.deep, undefined, f.connect);
    await second.onOpen(); const content = second.contentEl as unknown as InstanceType<typeof mocks.Element>;
    f.content.action("nav-tools").click(); content.action("nav-settings").click();
    let fail!: (error: Error) => void; f.tools.generateMocs.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    const stale = f.content.action("tool-generateMocs"); stale.click(); f.content.action("nav-settings").click(); stale.click();
    expect(f.tools.generateMocs).toHaveBeenCalledTimes(1);
    fail(new Error("PRIVATE_PROVIDER_BODY")); await flush();
    expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page"); expect(f.content.texts()).not.toContain("PRIVATE_PROVIDER_BODY");
    content.action("nav-health").click(); content.action("nav-tools").click(); f.tools.openAskVault.mockImplementationOnce(() => { throw new Error("PRIVATE_PROVIDER_BODY"); });
    content.action("tool-openAskVault").click(); await flush();
    expect(content.texts()).toContain("Could not open this tool"); expect(content.texts()).not.toContain("PRIVATE_PROVIDER_BODY");
    const feedback = content.querySelector("[data-workspace-message]")!;
    expect(feedback.texts()).toContain("Could not open this tool");
    expect(feedback.parentElement!.cls).toBe("veynrel-shell-main");
    expect(feedback.parentElement!.children[0]).toBe(feedback);
    content.action("tool-openAskVault").click(); await flush();
    expect(f.tools.openAskVault).toHaveBeenCalledTimes(2); expect(content.texts()).not.toContain("Could not open this tool");
    await second.onClose(); await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it.each(["onboarding", "findings.json", "scan-runs.json"])("%s hides Tools/Settings and rejects stale launch actions", async (boundary) => {
    const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-tools").click();
    const stale = f.content.action("tool-openBatchProcessing"); await f.view.onClose();
    if (boundary === "onboarding") await f.preferences.update({ onboardingCompleted: false, profileChosen: false });
    else f.files.set(`${root}/${boundary}`, "invalid");
    // A fresh controller models recovery discovered on reopen.
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const view = new VeynrelHealthView({ app: f.app } as never, controller, f.tools); await view.onOpen(); (view.contentEl as unknown as InstanceType<typeof mocks.Element>).action("nav-health")?.click();
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.action("nav-tools")).toBeUndefined(); expect(content.action("nav-settings")).toBeUndefined(); expect(content.action("tools")).toBeUndefined();
    stale.click(); expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
    await view.onClose(); controller.dispose(); f.controller.dispose(); f.recall.dispose();
  });
  it("onboarding taking over a mounted Tools view invalidates actions and cannot resurrect its route", async () => {
    const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-tools").click();
    const stale = f.content.action("tool-openAskVault");
    await f.controller.updatePreferences({ onboardingCompleted: false, profileChosen: false });
    stale.click(); expect(f.tools.openAskVault).not.toHaveBeenCalled(); expect(f.content.action("nav-tools")).toBeUndefined();
    await f.controller.updatePreferences({ onboardingCompleted: true, profileChosen: true });
    expect(f.content.action("nav-home").attrs["aria-current"]).toBe("page");
    stale.click(); expect(f.tools.openAskVault).not.toHaveBeenCalled();
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
});

describe("visual Health dashboard", () => {
  it.each(["en", "ru"] as const)("renders exact current metrics and decorative SVG in %s with passive repeated entry", async (language) => {
    setLanguage(language); const f = fixture(); await f.controller.getHealthService();
    const state = f.controller.getState(), snapshot = state.snapshot!;
    Object.assign(snapshot.dimensions.structure, { state: "needs-attention", openFindings: 78, attentionFindings: 50, reviewFindings: 20 });
    Object.assign(snapshot.dimensions.connections, { state: "review-recommended", openFindings: 1, reviewFindings: 1 });
    Object.assign(snapshot.dimensions.knowledge, { state: "review-recommended", analysisDepth: "deep", openFindings: 7, reviewFindings: 7, analysisComplete: true });
    snapshot.openFindings = 86;
    snapshot.recall = { loadState: "ready", firstRun: false, active: 143, due: 12, new: 4, nextDueAt: 1790362200000 };
    const scan = { id: "dashboard-fixture", type: "local" as const, status: "partial" as const, startedAt: 1790362000000, completedAt: 1790362080000,
      notesSeen: 312, findingsCreated: 8, findingsUpdated: 14, findingsResolved: 3, analyzerVersions: {}, reconciliationReceipts: {} };
    snapshot.lastLocalScan = scan; snapshot.lastLocalScanReconciled = true;
    snapshot.lastDeepScan = { ...scan, id: "deep-fixture", type: "deep", status: "completed", notesSeen: 148 }; snapshot.lastDeepScanReconciled = true;
    vi.spyOn(f.controller, "getState").mockReturnValue(state);
    const localScan = vi.spyOn(f.controller, "runLocalScan"), deepScan = vi.spyOn(f.controller, "runDeepScan"), semanticScan = vi.spyOn(f.controller, "runSemanticScan");
    const recallInit = vi.spyOn(f.controller, "initializeRecall");
    await f.view.onOpen(); f.content.action("nav-health")?.click();
    const metrics = (id: string) => f.content.all().find((e) => e.attrs["data-insight"] === id)!.all()
      .filter((e) => e.cls === "veynrel-dashboard-number").map((e) => e.text);
    expect(metrics("recall")).toEqual(["12", "143", "4"]);
    expect(metrics("knowledge")).toEqual(["148", "7"]);
    expect(metrics("local")).toEqual(["312", "8", "14", "3"]);
    const rows = f.content.all().filter((e) => e.attrs["data-area"]);
    expect(rows.map((e) => e.all().find((c) => c.cls === "veynrel-dashboard-area-total")?.text)).toEqual(["78", "1", "0", "7"]);
    expect(rows[2].all().filter((e) => e.cls === "veynrel-dashboard-bar-segment").every((e) => e.attrs.style === "width: 0%")).toBe(true);
    const svg = f.content.all().find((e) => e.tag === "svg")!;
    expect(svg.attrs["aria-hidden"]).toBe("true"); expect(svg.children.map((e) => e.tag)).toEqual(["path", "path"]);
    expect(f.content.texts()).toContain(language === "en" ? "Partial · limited coverage" : "Частичная · ограниченный охват");
    expect(f.content.texts()).not.toMatch(/@dashboard\.|retention|workload|polished|developed/iu);
    f.content.action("area-structure").focus();
    (f.view as unknown as { render(): void }).render();
    expect(f.content.ownerDocument.activeElement?.attrs["data-health-action"]).toBe("area-structure");
    const readCount = f.adapter.read.mock.calls.length;
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.adapter.read).toHaveBeenCalledTimes(readCount);
    expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    for (const effect of [f.vault.read, f.adapter.write, f.save, mocks.requestUrl, localScan, deepScan, semanticScan]) expect(effect).not.toHaveBeenCalled();
    // The existing metadata initialization entry is retained; it has no inventory capability.
    expect(recallInit).toHaveBeenCalled();
    await f.view.onClose();
  });
  it.each(["structure", "connections", "knowledge"])("area %s opens the existing Findings filter", async (id) => {
    const f = fixture(); await f.view.onOpen(); f.content.action("nav-health")?.click();
    expect(f.content.action(`area-${id}`).tag).toBe("button"); f.content.action(`area-${id}`).click();
    expect(f.content.action(`filter-${id}`).attrs["aria-pressed"]).toBe("true");
    expect(f.content.ownerDocument.activeElement?.attrs["data-health-heading"]).toBe("true");
  });
  it("blocking recovery and onboarding render no pulse or charts; history degradation keeps real current counts", async () => {
    const onboarding = fixture({ profileChosen: false, onboardingCompleted: false }); await onboarding.view.onOpen(); onboarding.content.action("nav-health")?.click();
    expect(onboarding.content.all().some((e) => e.attrs["data-pulse-state"])).toBe(false);
    const broken = fixture(); broken.files.set(`${root}/findings.json`, "{broken"); await broken.view.onOpen(); broken.content.action("nav-health")?.click();
    expect(broken.content.action("recover")).toBeDefined(); expect(broken.content.all().some((e) => e.attrs["data-area"])).toBe(false);
    const history = fixture(); history.files.set(`${root}/scan-runs.json`, "{broken"); await history.view.onOpen(); history.content.action("nav-health")?.click();
    expect(history.content.action("recover")).toBeDefined();
    expect(history.content.all().find((e) => e.attrs["data-pulse-state"])?.attrs["data-pulse-state"]).toBe("unknown");
    expect(history.content.texts()).toContain("Coverage not established");
  });
});

describe("real topology child route", () => {
  it("keeps Health focused and moves profile controls to Settings without losing tools", async () => {
    const f = fixture(); const topology = new VaultTopologyController(new ObsidianLocalVaultSource(f.app));
    const view = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, undefined, undefined, undefined, undefined, undefined, topology);
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    await view.onOpen(); (view.contentEl as unknown as InstanceType<typeof mocks.Element>).action("nav-health")?.click(); await f.controller.runLocalScan();
    const elements = content.all();
    const order = ["veynrel-vault-pulse", "veynrel-health-recommendation", "veynrel-health-dimensions", "veynrel-dashboard-insights"]
      .map((cls) => elements.findIndex((e) => e.cls.split(" ").includes(cls)));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(content.action("change-profile")).toBeUndefined();
    expect(content.action("topology-refresh")).toBeUndefined();
    content.action("nav-settings").click(); expect(content.action("change-profile")).toBeDefined();
    expect(content.action("tools")).toBeUndefined();
    content.action("nav-tools").click();
    expect(content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("tool-"))).toHaveLength(7);
    await view.onClose(); topology.dispose(); f.controller.dispose();
  });
  it("preserves inline scroll and nearby focus through held loads, refreshes and stale updates", async () => {
    const f = fixture(); const source = new ObsidianLocalVaultSource(f.app);
    const topology = new VaultTopologyController(source);
    const view = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, undefined, undefined, undefined, undefined, undefined, topology);
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    await view.onOpen(); content.action("nav-discover").click(); content.action("topology-open").click();
    // Model a browser clamping scroll when the view body is replaced. Real layout
    // and keyboard/viewport bounds are also checked by the native regression.
    const body = content.all().find(e => e.cls === "veynrel-workspace")!;
    const empty = body.empty.bind(body);
    vi.spyOn(body, "empty").mockImplementation(() => { empty(); content.scrollTop = 0; });
    const capture = source.captureMetadata.bind(source);
    for (const stage of ["load", "refresh", "stale"] as const) {
      content.scrollTop = 900;
      if (stage === "stale") { topology.markStale(); expect(content.scrollTop).toBe(900); }
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      vi.spyOn(source, "captureMetadata").mockImplementationOnce(async (signal) => { await held; return capture(signal); });
      const button = content.action("topology-refresh"); button.focus(); button.click();
      expect(topology.getSnapshot().state).toBe("loading");
      expect(content.action("topology-refresh").disabled).toBe(true);
      expect(content.ownerDocument.activeElement).toBe(content.action("topology-refresh").parentElement);
      expect(content.ownerDocument.activeElement?.focusOptions).toEqual({ preventScroll: true });
      expect(content.all().find((e) => e.attrs["aria-live"] === "polite")?.text).toContain(t("@topology.loading"));
      expect(content.scrollTop).toBe(900);
      release(); await topology.load();
      expect(topology.getSnapshot().state).toBe("ready");
      expect(content.ownerDocument.activeElement).toBe(content.action("topology-refresh"));
      expect(content.ownerDocument.activeElement?.focusOptions).toEqual({ preventScroll: true });
      expect(content.scrollTop).toBe(900);
      expect(body.attrs["data-page"]).toBe("topology");
    }
    // Completion must not take focus back if the user has moved on.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(source, "captureMetadata").mockImplementationOnce(async (signal) => { await held; return capture(signal); });
    content.action("topology-refresh").click(); content.action("topology-back").focus();
    release(); await topology.load();
    expect(content.ownerDocument.activeElement).toBe(content.action("topology-back"));
    // Deliberate navigation still focuses the destination heading.
    for (const action of ["nav-health", "nav-discover", "topology-open"]) {
      content.action(action).click();
      expect(content.ownerDocument.activeElement?.attrs["data-health-heading"]).toBe("true");
      expect(content.ownerDocument.activeElement?.focusOptions).toBeUndefined();
      content.action("nav-discover").click();
    }
    await view.onClose(); topology.dispose(); f.controller.dispose();
  });
  it("Health stays passive, explicit loading reads metadata only, navigation retains map and Open note reuses safe navigation", async () => {
    const f = fixture(); const topology = new VaultTopologyController(new ObsidianLocalVaultSource(f.app));
    const view = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, undefined, undefined, undefined, undefined, undefined, topology);
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    const capture = vi.spyOn(f.vault, "getMarkdownFiles");
    await view.onOpen(); content.action("nav-discover").click(); content.action("topology-open").click(); expect(capture).toHaveBeenCalledTimes(1); capture.mockClear();
    expect(content.texts()).toContain("See how your notes connect.");
    expect(content.action("topology-refresh").text).toBe("Load map");
    expect(capture).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(content.all().some((e) => e.cls === "veynrel-health-page-enter")).toBe(true);
    content.action("topology-refresh").click(); await topology.load();
    expect(topology.getSnapshot().state).toBe("ready"); expect(capture).toHaveBeenCalledTimes(2);
    expect(f.metadataCache.getFileCache).toHaveBeenCalledTimes(1);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(mocks.requestUrl).not.toHaveBeenCalled();
    expect(content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(content.action("nav-topology")).toBeUndefined();
    expect(content.all().find((e) => e.attrs["aria-live"] === "polite")?.attrs["aria-atomic"]).toBe("true");
    expect(content.all().some((e) => e.cls === "veynrel-health-page-enter")).toBe(false);
    content.action("topology-search").input("a.MD");
    content.action("topology-result-0").click();
    expect(content.texts()).toContain("Orphan note");
    content.action("topology-open-note").click(); await flush();
    expect(f.openFile).toHaveBeenCalledTimes(1);
    f.vault.getAbstractFileByPath.mockReturnValue(null);
    content.action("topology-open-note").click(); await flush();
    expect(content.querySelector("[data-workspace-message]")?.texts()).toContain("This note is no longer available");
    expect(content.texts()).toContain("This note is no longer available");
    expect(content.all().some((e) => e.cls === "veynrel-health-page-enter")).toBe(false);
    content.action("topology-back").click(); expect(capture).toHaveBeenCalledTimes(2);
    content.action("topology-open").click();
    topology.markStale(); expect(content.texts()).toContain("Map may be outdated");
    content.action("topology-refresh").click(); await topology.load(); expect(capture).toHaveBeenCalledTimes(4);
    await view.onClose(); await view.onOpen(); content.action("nav-discover").click(); content.action("topology-open").click(); expect(capture).toHaveBeenCalledTimes(5);
    await view.onClose(); topology.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("groups partial coverage, exact metrics and bounded relationships without loading in %s", async (language) => {
    setLanguage(language);
    const paths = Array.from({ length: 22 }, (_, i) => `Folder/Note-${i}.md`);
    const map = await deriveTopology(snapshot([
      note("Hub.md", { resolvedOutgoing: paths, unresolvedLinks: paths.map((target) => ({ target: `Missing/${target}`, count: 2 })) }),
      ...paths.map((path) => note(path, { resolvedOutgoing: ["Hub.md"] })),
      note("Unknown.md", { linksAvailable: false }),
    ]), 100, new AbortController().signal);
    const port = { getSnapshot: () => ({ state: "ready" as const, map }), subscribe: vi.fn(), load: vi.fn(), refresh: vi.fn(), dispose: vi.fn() };
    const parent = new mocks.Element(); const state = newTopologyViewState(); state.selected = "Hub.md";
    const openNote = vi.fn(); const back = vi.fn();
    const cleanup = renderTopology(parent as unknown as HTMLElement, port, state, { back, openNote });
    const find = (cls: string) => parent.all().find((e) => e.cls === cls)!;
    const header = find("veynrel-topology-header");
    expect(header.texts()).toContain(t("@topology.partial"));
    expect(header.texts()).toContain(t("@topology.partial-explanation"));
    expect(header.all().filter((e) => e.tag === "button").map((e) => e.attrs["data-health-action"])).toEqual(["topology-refresh"]);
    expect(parent.action("topology-refresh").cls).toContain("veynrel-quiet");
    expect(parent.action("topology-refresh").cls).not.toContain("mod-cta");
    const metrics = find("veynrel-topology-metrics");
    expect(metrics.all().filter((e) => e.tag === "dd").map((e) => e.text)).toEqual(["24", "44", "2", t("@topology.unknown"), t("@topology.unknown"), "44"]);
    expect(metrics.children.filter((e) => e.attrs["data-unknown"] === "true")).toHaveLength(2);
    expect(find("veynrel-topology-map-panel").action("topology-fit").tag).toBe("button");
    expect(find("veynrel-topology-search").tag).toBe("label");
    expect(find("veynrel-topology-legend").tag).toBe("details");
    const inspector = find("veynrel-topology-inspector");
    expect(inspector.all().find((e) => e.tag === "h2")?.text).toBe("Hub");
    expect(find("veynrel-topology-path").text).toBe("Hub.md");
    expect(find("veynrel-topology-facts").all().filter((e) => e.tag === "dd").map((e) => e.text)).toEqual(["22", "22", "44", "23", t("@topology.unknown"), t("@topology.unknown"), "22", "44"]);
    const groups = inspector.all().filter((e) => e.cls === "veynrel-topology-relationships");
    expect(groups.map((e) => e.all().filter((item) => item.tag === "li").length)).toEqual([20, 20, 20]);
    expect(groups.every((e) => e.texts().includes(t("@topology.showing-items", { shown: 20, total: 22 })))).toBe(true);
    expect(groups[2].texts()).toContain("Missing/Folder/Note-0.md (2)");
    parent.action("topology-open-note").click(); expect(openNote).toHaveBeenCalledWith("Hub.md");
    parent.action("topology-incoming-0").focus(); parent.action("topology-incoming-0").click();
    expect(state.selected).toBe(paths[0]);
    expect(parent.ownerDocument.activeElement?.tag).toBe("h2");
    parent.action("topology-outgoing-0").click(); expect(state.selected).toBe("Hub.md");
    parent.action("topology-back").click(); expect(back).toHaveBeenCalledOnce();
    expect(port.load).not.toHaveBeenCalled(); expect(port.refresh).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("Semantic Neighborhood Discover child surface", () => {
  beforeEach(() => { vi.stubGlobal("window", { setTimeout, clearTimeout }); });
  afterEach(() => vi.unstubAllGlobals());
  async function neighborhoodFixture(withComparison = false) {
    const { SemanticGlobalMapController } = await import("../../semantic/product/semanticGlobalMapController");
    const { SemanticNeighborhoodController } = await import("../../semantic/product/semanticNeighborhoodController");
    let index = { kind: "ready" as SemanticStatus["kind"], vectorCount: 9, vectorGeneration: 1, dimensions: 3,
      provider: "ollama", providerLabel: "Ollama", model: "synthetic", configurationRevision: 0, runtimeRevision: 1 };
    const listeners = new Set<() => void>();
    const engine = { getCachedIndexState: () => index, getSemanticStatus: () => index,
      subscribeStatus: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
      analyzeSemanticFocus: vi.fn(async (path: string) => ({ path, scores: ["A.md", "B.md"].map((p) => ({ path: p, score: p === path ? 1 : 0.91 })) })),
      analyzeGlobalSemanticMap: vi.fn(async () => ({ state: "ready" as const, indexedNoteCount: 2, mappedNoteCount: 2,
        nodes: ["A.md", "B.md"].map((path, i) => ({ path, coreSimilarity: 0.96, semanticConnectedness: 0.91,
          neighbors: [{ path: i ? "A.md" : "B.md", score: 0.91 }] })), edges: [{ left: "A.md", right: "B.md", score: 0.91, mutual: true }] })),
      listIndexedPaths: vi.fn(async () => ["A.md", "B.md"]),
      findSimilarNotes: vi.fn(async (source: string) => [{ path: source === "A.md" ? "B.md" : "A.md", score: 0.91,
        matches: [{ id: "chunk", path: source === "A.md" ? "B.md" : "A.md", score: 0.94, headingPath: ["Stored heading"], ordinal: 0, contentHash: "hash",
          preview: "<img src=x onerror=alert(1)> literal preview", source: { startLine: 2, endLine: 5, startOffset: 0, endOffset: 100 } }] }]),
      refreshSemanticStatus: vi.fn(async () => index), indexVault: vi.fn(), rebuildIndex: vi.fn(), openSearch: vi.fn(), openSimilarNotes: vi.fn(), openPotentialDuplicates: vi.fn() };
    const settings = { get: () => ({ ...DEFAULT_EMBEDDING_SETTINGS, enabled: true }), update: vi.fn() };
    const semantic = new SemanticIntelligenceController(settings, engine);
    const neighborhood = new SemanticNeighborhoodController(engine);
    const globalMap = new SemanticGlobalMapController(engine);
    const topology = new VaultTopologyController({ captureMetadata: async () => snapshot([note("A.md", { resolvedOutgoing: ["B.md"] }), note("B.md")]),
      captureRevision: async () => (await deriveTopology(snapshot([note("A.md"), note("B.md")]), 1, new AbortController().signal)).revision });
    const comparison = withComparison ? new ConnectionComparisonController(globalMap, topology) : undefined;
    const f = fixture();
    const cachedRead = vi.fn(); Object.assign(f.vault, { cachedRead });
    const view = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, semantic, undefined, undefined, undefined, undefined, withComparison ? topology : undefined, neighborhood, globalMap, comparison);
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    await view.onOpen(); (view.contentEl as unknown as InstanceType<typeof mocks.Element>).action("nav-health")?.click();
    return { ...f, cachedRead, view, content, engine, semantic, neighborhood, globalMap, topology, comparison, change: () => { index = { ...index, vectorGeneration: 2 }; for (const l of listeners) l(); } };
  }
  it("requires scope consent before map work and rejects a stale map launcher", async () => {
    const f = await neighborhoodFixture(true);
    f.vault.getAllFolders.mockReturnValue([{ path: "Folder" }]);
    await f.view.onClose(); await f.view.onOpen(); f.content.action("scope-0").click();
    f.content.action("nav-discover").click();
    for (const key of ["discover-search", "global-map-open", "connections-open", "topology-open"]) {
      expect(f.content.action(key).disabled).toBe(true); f.content.action(key).click();
    }
    expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled(); expect(f.engine.openSearch).not.toHaveBeenCalled();
    f.content.action("scope-continue").click();
    const old = f.content.action("global-map-open");
    f.content.action("scope-picker").input(""); old.click();
    expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled();
    f.content.action("scope-picker").input("Folder"); f.content.action("scope-continue").click();
    f.content.action("global-map-open").click(); await f.globalMap.load();
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledTimes(1);
    expect(f.content.action("scope-continue")).toBeUndefined();
    expect(f.content.texts()).toContain("whole vault");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    await f.view.onClose(); f.comparison?.dispose(); f.topology.dispose(); f.globalMap.dispose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("comparison stays passive and preserves its category/query/pair/limit across A-B-C Neighborhood round-trip in %s", async lang => {
    setLanguage(lang); const f = await neighborhoodFixture(true), comparison = f.comparison!;
    const loadSemantic = vi.spyOn(f.globalMap, "load"), loadTopology = vi.spyOn(f.topology, "load"), loadComparison = vi.spyOn(comparison, "load");
    const fetch = vi.fn(), xhr = vi.fn(); vi.stubGlobal("fetch", fetch); vi.stubGlobal("XMLHttpRequest", xhr);
    f.vault.read.mockClear(); f.cachedRead.mockClear(); f.adapter.write.mockClear(); mocks.requestUrl.mockClear();
    f.content.action("nav-discover").click();
    expect(f.content.action("connections-open")).toBeDefined();
    for (const spy of [loadSemantic, loadTopology, loadComparison]) expect(spy).not.toHaveBeenCalled();
    await f.globalMap.load(); // Normal usage reuses the Global Map already computed by its owner.
    f.content.action("connections-open").click(); await comparison.load();
    expect(comparison.getSnapshot().state).toBe("ready"); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    expect(loadSemantic).toHaveBeenCalledOnce(); expect(loadTopology).toHaveBeenCalledOnce();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page"); expect(f.content.action("nav-connection-opportunities")).toBeUndefined();
    f.content.action("connections-aligned").click(); f.content.action("connections-pair-0").click();
    f.content.action("connections-search").input("join");
    const state = (f.view as unknown as { comparisonView: ReturnType<typeof newConnectionComparisonViewState> }).comparisonView;
    state.visibleLimit = 100;
    state.rankFilter = "mutual-top-3"; state.reviewFilter = "unreviewed"; state.hideExcalidraw = true;
    state.reviewByPairId.set("session-a", "useful"); state.reviewByPairId.set("session-b", "unsure");
    const before = { ...state, reviewByPairId: new Map(state.reviewByPairId) }, loads = loadComparison.mock.calls.length, captured = comparison.getSnapshot().comparison;
    f.content.action("connections-explore-left").click(); await f.neighborhood.load("A.md");
    expect(f.content.action("neighborhood-back").text).toBe(t("@connections.back-comparison"));
    f.content.action("neighborhood-select-1").click(); f.content.action("neighborhood-explore").click(); await f.neighborhood.load("B.md");
    expect(f.neighborhood.getSnapshot().sourcePath).toBe("B.md");
    // Recenter again through the same existing product operation; origin belongs to the route.
    await f.neighborhood.load("C.md"); expect(f.neighborhood.getSnapshot().sourcePath).toBe("C.md");
    f.content.action("neighborhood-back").click();
    expect(state).toEqual(before); expect(f.content.action("connections-search").value).toBe("join");
    expect(f.content.action("connections-aligned").attrs["aria-pressed"]).toBe("true");
    expect(loadComparison).toHaveBeenCalledTimes(loads); expect(comparison.getSnapshot().comparison).toBe(captured);
    expect(f.content.texts()).not.toMatch(/@connections\./);
    await comparison.refresh(); expect(state.reviewByPairId.size).toBe(0);
    for (const spy of [f.vault.read, f.cachedRead, f.adapter.write, mocks.requestUrl, fetch, xhr]) expect(spy).not.toHaveBeenCalled();
    f.content.action("connections-open-left").click(); await flush(); expect(f.openFile).toHaveBeenCalledOnce();
    await f.view.onClose(); comparison.dispose(); f.topology.dispose(); f.globalMap.dispose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it("keeps passive Discover free of catalog/similarity/body/network/write work, and preserves existing launchers", async () => {
    const f = await neighborhoodFixture();
    f.vault.read.mockClear(); f.cachedRead.mockClear(); f.adapter.write.mockClear();
    mocks.requestUrl.mockClear();
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    f.content.action("nav-discover").click();
    expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled();
    expect(f.engine.listIndexedPaths).not.toHaveBeenCalled(); expect(f.engine.findSimilarNotes).not.toHaveBeenCalled();
    for (const spy of [f.vault.read, f.cachedRead, f.adapter.write, mocks.requestUrl, fetch]) expect(spy).not.toHaveBeenCalled();
    for (const action of ["discover-search", "discover-related", "discover-duplicates", "semantic-health-scan"]) expect(f.content.action(action)).toBeDefined();
    f.content.action("neighborhood-open").click(); await f.neighborhood.prepare();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(f.content.action("nav-semantic-neighborhood")).toBeUndefined(); expect(f.content.action("nav-tools")).toBeDefined();
    expect(f.content.action("neighborhood-search")).toBeDefined();
    expect(f.engine.listIndexedPaths).toHaveBeenCalledOnce(); expect(f.engine.findSimilarNotes).not.toHaveBeenCalled();
    await f.view.onClose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("renders map scale/summary and preserves local selection and Neighborhood integration in %s", async (lang) => {
    setLanguage(lang); const f = await neighborhoodFixture();
    f.content.action("nav-discover").click(); expect(f.engine.analyzeGlobalSemanticMap).not.toHaveBeenCalled();
    f.vault.read.mockClear(); f.cachedRead.mockClear(); f.adapter.write.mockClear(); mocks.requestUrl.mockClear();
    f.content.action("global-map-open").click(); await f.globalMap.load();
    expect(f.content.action("nav-semantic-map")).toBeUndefined(); expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    expect(f.content.all().filter(e => e.attrs["tabindex"] === "0")).toEqual([]);
    expect(f.content.action("global-map-open-note")).toBeUndefined();
    expect(f.content.texts()).toContain(t("@global-map.radial-scale"));
    expect(f.content.texts()).toContain(t("@global-map.score-summary", { min: "0.960", max: "0.960", median: "0.960" }));
    expect(f.content.texts()).toContain(t("@global-map.score-summary", { min: "0.910", max: "0.910", median: "0.910" }));
    const rings = f.content.all().filter(e => e.cls === "veynrel-global-map-guide");
    const scale = f.content.all().filter(e => e.cls === "veynrel-global-map-ring-label");
    expect(rings.map(e => Number(e.attrs.r))).toEqual([120, 265, 410]);
    expect(scale.map(e => Number(e.attrs.y))).toEqual([368, 223, 78]);
    const coordinates = () => f.content.all().filter(e => e.cls === "veynrel-global-map-dot").map(e => ({ ...e.attrs }));
    const before = coordinates();
    f.content.action("global-map-search").input("B.md"); f.content.action("global-map-result-0").click();
    expect(f.content.texts()).toContain("B.md"); expect(f.content.texts()).toContain("0.910");
    expect(coordinates()).toEqual(before);
    expect(f.content.all().find(e => e.attrs["data-global-map-node"] === "B.md")?.attrs["data-selected"]).toBe("true");
    expect(f.content.texts()).not.toContain("@global-map.");
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    for (const spy of [f.vault.read, f.cachedRead, f.adapter.write, mocks.requestUrl]) expect(spy).not.toHaveBeenCalled();
    f.content.action("global-map-explore").click(); await f.neighborhood.load("B.md");
    expect(f.neighborhood.getSnapshot().map?.source.path).toBe("B.md");
    f.content.action("neighborhood-back").click();
    expect(f.content.action("global-map-search").value).toBe("B.md");
    expect(f.content.all().find(e => e.attrs["data-global-map-node"] === "B.md")?.attrs["data-selected"]).toBe("true");
    expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce(); f.change();
    expect(f.content.texts()).toContain(t("@global-map.stale"));
    f.content.action("global-map-refresh").click(); await f.globalMap.refresh(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledTimes(2);
    await f.view.onClose(); f.globalMap.dispose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("preserves child-route origin and global map, selection, query and viewport across local exploration in %s", async lang => {
    setLanguage(lang); const f = await neighborhoodFixture();
    f.content.action("nav-discover").click(); f.content.action("neighborhood-open").click(); await f.neighborhood.prepare();
    expect(f.content.action("neighborhood-back").text).toBe(t("@neighborhood.back"));
    f.content.action("neighborhood-back").click(); expect(f.content.action("global-map-open")).toBeDefined();
    f.content.action("global-map-open").click(); await f.globalMap.load();
    f.content.action("global-map-search").input("A.md"); f.content.action("global-map-result-0").click();
    // The native harness below exercises real drag/wheel input; here assert exact state ownership.
    const local = (f.view as unknown as { globalMapView: { query: string; selected?: string; viewport: { x: number; y: number; zoom: number } } }).globalMapView;
    local.viewport = { x: 137, y: -91, zoom: 1.7 };
    const before = { ...local }, map = f.globalMap.getSnapshot().map;
    f.content.action("global-map-explore").click(); await f.neighborhood.load("A.md");
    for (const path of ["B.md", "A.md"]) {
      f.content.action("neighborhood-select-1").click(); f.content.action("neighborhood-explore").click(); await f.neighborhood.load(path);
      expect(f.content.action("neighborhood-back").text).toBe(t("@neighborhood.back-global"));
    }
    f.content.action("neighborhood-choose").click(); f.content.action("neighborhood-source-1").click(); await f.neighborhood.load("B.md");
    f.content.action("neighborhood-refresh").click(); await f.neighborhood.refresh();
    f.change(); expect(f.globalMap.getSnapshot().state).toBe("stale");
    f.vault.read.mockClear(); f.cachedRead.mockClear(); f.adapter.write.mockClear(); mocks.requestUrl.mockClear();
    const loads = vi.spyOn(f.globalMap, "load");
    f.content.action("neighborhood-back").click();
    expect(f.globalMap.getSnapshot().map).toBe(map); expect(local).toEqual(before);
    expect(f.content.action("global-map-search").value).toBe("A.md");
    expect(f.content.texts()).toContain(t("@global-map.stale"));
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(loads).not.toHaveBeenCalled(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    for (const spy of [f.vault.read, f.cachedRead, f.adapter.write, mocks.requestUrl]) expect(spy).not.toHaveBeenCalled();
    // A new Discover entry sets its own origin even after prior Global exploration.
    f.content.action("global-map-back").click(); f.content.action("neighborhood-open").click(); await f.neighborhood.prepare();
    expect(f.content.action("neighborhood-back").text).toBe(t("@neighborhood.back"));
    f.content.action("neighborhood-back").click(); expect(f.content.action("global-map-open")).toBeDefined();
    await f.view.onClose(); f.globalMap.dispose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it.each(["en", "ru"] as const)("focuses explicitly, updates captions/metrics, omits self-score, and resets locally in %s", async lang => {
    setLanguage(lang); const f = await neighborhoodFixture();
    f.content.action("nav-discover").click(); f.content.action("global-map-open").click(); await f.globalMap.load();
    const dots = () => f.content.all().filter(e => e.cls === "veynrel-global-map-dot").map(e => ({ ...e.attrs }));
    const core = dots();
    f.content.action("global-map-search").input("A.md"); f.content.action("global-map-result-0").click();
    expect(f.engine.analyzeSemanticFocus).not.toHaveBeenCalled(); expect(dots()).toEqual(core);
    f.content.action("global-map-focus").focus(); f.content.action("global-map-focus").click(); await f.globalMap.focus("A.md");
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("global-map-focus"));
    expect(dots()[0]).toMatchObject({ cx: "500", cy: "500", r: core[0].r });
    expect(dots().map(dot => dot.r)).toEqual(core.map(dot => dot.r));
    expect(f.content.all().some(e => e.cls === "veynrel-global-map-core")).toBe(false);
    for (const key of ["centered", "focus-radial-scale", "selected-similarity"]) expect(f.content.texts()).toContain(t(`@global-map.${key}`, { note: "A" }));
    expect(f.content.texts()).not.toContain("1.000"); expect(f.content.texts()).not.toContain(t("@global-map.similarity"));
    f.content.action("global-map-neighbor-0").click(); expect(f.content.texts()).toContain(t("@global-map.focus-similarity"));
    expect(f.globalMap.getSnapshot().focus?.path).toBe("A.md"); expect(f.engine.analyzeSemanticFocus).toHaveBeenCalledOnce();
    f.content.action("global-map-reset-focus").focus(); f.content.action("global-map-reset-focus").click(); expect(dots()).toEqual(core);
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("global-map-focus"));
    expect(f.content.texts()).toContain(t("@global-map.radial-scale"));
    expect(f.engine.analyzeSemanticFocus).toHaveBeenCalledOnce(); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledOnce();
    expect(f.content.texts()).not.toMatch(/@(?:global-map|neighborhood)\./u);
    await f.view.onClose(); f.globalMap.dispose(); f.neighborhood.dispose(); f.controller.dispose();
  });
  it("visible zoom, fit and reset preserve selection, real scores and the captured map without recomputation", async () => {
    const f = await neighborhoodFixture();
    f.content.action("nav-discover").click(); f.content.action("global-map-open").click(); await f.globalMap.load();
    const map = f.globalMap.getSnapshot().map!, before = JSON.stringify(map);
    const state = (f.view as unknown as { globalMapView: { viewport: { x: number; y: number; zoom: number } } }).globalMapView;
    const group = () => f.content.all().find(e => e.attrs["data-global-map-node"] === "A.md")!;
    for (let i = 0; i < 15; i++) f.content.action("global-map-zoom-in").click();
    expect(state.viewport.zoom).toBe(24); expect(group().attrs.transform).toContain(`scale(${1 / 24})`);
    f.content.action("global-map-search").input("A.md"); f.content.action("global-map-result-0").click();
    expect(group().attrs["data-selected"]).toBe("true"); expect(f.content.texts()).toContain("0.960");
    f.content.action("global-map-open-note").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.content.action("global-map-fit").click(); expect(state.viewport.zoom).toBeGreaterThan(1);
    f.content.action("global-map-reset-view").click(); expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(group().attrs.transform).toContain("scale(1)");
    for (let i = 0; i < 15; i++) f.content.action("global-map-zoom-out").click();
    expect(state.viewport.zoom).toBe(0.4); expect(group().attrs["data-selected"]).toBe("true");
    expect(JSON.stringify(map)).toBe(before); expect(f.engine.analyzeGlobalSemanticMap).toHaveBeenCalledTimes(1);
    expect(f.engine.analyzeSemanticFocus).not.toHaveBeenCalled(); expect(f.cachedRead).not.toHaveBeenCalled();
    await f.view.onClose();
  });
  it.each(["en", "ru"] as const)("selects without querying, recenters explicitly, preserves viewport, and renders literal evidence in %s", async (lang) => {
    setLanguage(lang); const f = await neighborhoodFixture();
    f.content.action("nav-discover").click(); f.content.action("neighborhood-open").click(); await f.neighborhood.prepare();
    f.content.action("neighborhood-source-0").focus(); f.content.action("neighborhood-source-0").click(); await f.neighborhood.load("A.md");
    expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(1);
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("neighborhood-select-0"));
    expect(f.content.texts()).toContain(t("@neighborhood.legend"));
    expect(f.content.action("neighborhood-select-0").attrs["aria-pressed"]).toBe("true");
    f.content.action("neighborhood-select-1").focus(); f.content.action("neighborhood-select-1").click();
    expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(1); expect(f.content.texts()).toContain("<img src=x onerror=alert(1)> literal preview");
    expect(f.content.all().filter((e) => e.tag === "img")).toEqual([]);
    expect(f.content.texts()).toContain(t("@neighborhood.evidence")); expect(f.content.texts()).not.toContain("@neighborhood.");
    f.content.scrollTop = 850; f.content.action("neighborhood-explore").focus(); f.content.action("neighborhood-explore").click();
    expect(f.content.scrollTop).toBe(850); expect(f.content.texts()).toContain(t("@neighborhood.loading"));
    await f.neighborhood.load("B.md"); expect(f.neighborhood.getSnapshot().map?.source.path).toBe("B.md");
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("neighborhood-select-0"));
    expect(f.engine.findSimilarNotes.mock.calls).toEqual([["A.md"], ["B.md"]]); expect(f.content.scrollTop).toBe(850);
    f.change(); expect(f.content.texts()).toContain(t("@neighborhood.stale")); expect(f.engine.findSimilarNotes).toHaveBeenCalledTimes(2);
    f.content.action("neighborhood-refresh").focus(); f.content.action("neighborhood-refresh").click(); await f.neighborhood.refresh();
    expect(f.content.scrollTop).toBe(850); expect(f.content.ownerDocument.activeElement).toBe(f.content.action("neighborhood-refresh"));
    expect(f.content.action("neighborhood-refresh").focusOptions).toEqual({ preventScroll: true });
    f.content.action("neighborhood-choose").focus(); f.content.action("neighborhood-choose").click();
    expect(f.content.ownerDocument.activeElement).toBe(f.content.action("neighborhood-search")); expect(f.content.action("neighborhood-search")).toBeDefined();
    expect(f.engine.listIndexedPaths).toHaveBeenCalledTimes(2);
    await f.view.onClose(); await f.view.onOpen(); f.content.action("nav-health")?.click(); f.content.action("nav-discover").click(); f.content.action("neighborhood-open").click(); await f.neighborhood.prepare();
    expect(f.engine.listIndexedPaths).toHaveBeenCalledTimes(2);
    await f.view.onClose(); f.neighborhood.dispose(); f.controller.dispose();
  });
});

describe("Semantic Intelligence indexing diagnostics", () => {
  const base: SemanticIntelligenceSnapshot = { enabled: true, state: "busy", provider: "openrouter", providerLabel: "OpenRouter",
    model: "synthetic", vectorCount: 0, indexRequired: true, busy: true, operation: "build" };
  const actions = { action: vi.fn(), choose: vi.fn(), edit: vi.fn(), connect: vi.fn(), back: vi.fn() };
  const failures = [
    ["provider-timeout", "timed out", "Истекло время"], ["provider-network", "Could not reach", "Не удалось связаться"],
    ["provider-auth", "rejected the credentials", "данные авторизации"], ["provider-rate-limit", "rate limit", "лимит запросов"],
    ["provider-server", "temporarily unavailable", "временно недоступен"], ["provider-request", "rejected the request", "отклонил запрос"],
    ["provider-response", "invalid response", "некорректный ответ"], ["source", "could not read", "не смог прочитать"],
    ["storage", "safely update", "безопасно обновить"], ["compatibility", "different embedding configuration", "другой конфигурацией"],
    ["unknown", "build failed", "Не удалось построить"],
  ] as const;
  it.each(["en", "ru"] as const)("renders every safe failure in %s without exceptions or stale progress", (language) => {
    setLanguage(language);
    for (const [failure, en, ru] of failures) {
      const parent = new mocks.Element();
      renderSemanticIntelligence(parent as never, { ...base, state: failure === "compatibility" ? "incompatible" : "error", busy: false,
        failure, progress: { phase: "embedding", chunksCompleted: 96, chunksTotal: 347 } }, undefined, actions);
      expect(parent.texts()).toContain(language === "en" ? en : ru);
      expect(parent.texts()).not.toMatch(/@semantic|Error:|private-|Authorization|stack|response body/u);
      expect(parent.all().some((element) => element.tag === "progress")).toBe(false);
      expect(parent.action(failure === "compatibility" ? "semantic-rebuild" : "semantic-check")).toBeDefined();
    }
  });
  it.each(["en", "ru"] as const)("shows real counts and native accessible progress in %s", (language) => {
    setLanguage(language); const parent = new mocks.Element();
    renderSemanticIntelligence(parent as never, { ...base, progress: { phase: "embedding", documentsTotal: 159,
      chunksTotal: 347, chunksCompleted: 96, batchCurrent: 3, batchTotal: 11 } }, undefined, actions);
    const bar = parent.all().find((element) => element.tag === "progress")!;
    expect(bar.value).toBe(96); expect((bar as unknown as { max: number }).max).toBe(347);
    expect(bar.attrs["aria-label"]).toContain("96 / 347");
    for (const text of ["159", "96 / 347", "3 / 11"]) expect(parent.texts()).toContain(text);
    expect(parent.texts()).not.toContain("%");
  });
  it.each(["en", "ru"] as const)("shows retry attempt 2 of 3 in %s", (language) => {
    setLanguage(language); const parent = new mocks.Element();
    renderSemanticIntelligence(parent as never, { ...base, progress: { phase: "retrying", chunksTotal: 347, chunksCompleted: 96,
      batchCurrent: 3, batchTotal: 11, retryAttempt: 1, retryMaximum: 2, retryReason: "rate-limit" } }, undefined, actions);
    expect(parent.texts()).toContain(language === "en" ? "Attempt 2 of 3" : "Попытка 2 из 3");
    expect(parent.texts()).toContain(language === "en" ? "Rate limit reached" : "Достигнут лимит запросов");
  });
  it("uses the same progress and failure surface on Discover", () => {
    setLanguage("en"); const parent = new mocks.Element();
    renderDiscover(parent as never, discoverViewModel({ ...base, progress: { phase: "embedding", documentsTotal: 159,
      chunksTotal: 347, chunksCompleted: 96, batchCurrent: 3, batchTotal: 11 } }), vi.fn());
    expect(parent.texts()).toContain("96 / 347"); expect(parent.texts()).toContain("3 / 11");
    expect(parent.all().find((e) => e.tag === "progress")?.value).toBe(96);
    parent.empty();
    renderDiscover(parent as never, discoverViewModel({ ...base, state: "error", busy: false, failure: "provider-timeout" }), vi.fn());
    expect(parent.texts()).toContain("Embedding request timed out");
    expect(parent.all().some((e) => e.tag === "progress")).toBe(false);
  });
  it("starts indeterminate without invented counts", () => {
    const parent = new mocks.Element();
    renderSemanticIntelligence(parent as never, { ...base, progress: { phase: "reading" } }, undefined, actions);
    const bar = parent.all().find((element) => element.tag === "progress")!;
    expect(bar.attrs.value).toBeUndefined(); expect(bar.attrs.max).toBeUndefined();
    expect(parent.texts()).not.toMatch(/\d|%/u);
  });
});

describe("safe rejected-batch UI", () => {
  const snapshot: SemanticIntelligenceSnapshot = { enabled: true, state: "error", provider: "openrouter", providerLabel: "OpenRouter",
    model: "synthetic", vectorCount: 0, indexRequired: true, busy: false, failure: "provider-request",
    rejectedBatch: { batchCurrent: 17, batchTotal: 17, inputCount: 3, largestInputChars: 1800, totalInputChars: 4700, oversizedInputCount: 0 } };
  const actions = { action: vi.fn(), choose: vi.fn(), edit: vi.fn(), connect: vi.fn(), back: vi.fn() };
  it.each(["en", "ru"] as const)("shows counts without claiming their cause in both %s surfaces", (language) => {
    setLanguage(language);
    for (const surface of ["inline", "discover"]) {
      const parent = new mocks.Element();
      if (surface === "inline") renderSemanticIntelligence(parent as never, snapshot, undefined, actions);
      else renderDiscover(parent as never, discoverViewModel(snapshot), vi.fn());
      for (const text of ["17 / 17", "3", "1800", "4700", language === "en" ? "input-specific provider rejection" : "конкретными входными данными"])
        expect(parent.texts()).toContain(text);
      expect(parent.texts()).toContain(language === "en" ? "rejected the request" : "отклонил запрос");
      expect(parent.texts()).not.toMatch(/Error:|private-|Authorization|stack|https:|<script/u);
      expect(parent.all().some(e => e.tag === "progress")).toBe(false);
      expect(parent.action(surface === "inline" ? "semantic-check" : "discover-check")).toBeDefined();
    }
  });
  it.each(["provider-timeout", "provider-rate-limit", undefined] as const)("hides batch shape for %s", (failure) => {
    const parent = new mocks.Element();
    renderSemanticIntelligence(parent as never, { ...snapshot, failure }, undefined, actions);
    expect(parent.texts()).not.toContain("4700");
  });
  it("hides previous counts during a new operation", () => {
    const parent = new mocks.Element();
    renderSemanticIntelligence(parent as never, { ...snapshot, busy: true, operation: "build" }, undefined, actions);
    expect(parent.texts()).not.toContain("4700");
  });
});


describe("bounded connection pair presentation", () => {
  it.each(["en", "ru"] as const)("filters before limiting, shows exact counts, preserves text and accessible selection in %s", async lang => {
    setLanguage(lang);
    const original = deriveConnectionComparison(comparisonSemanticMap(), await comparisonTopologyMap(), 1);
    const template = original.pairs.find(p => p.category === "candidate")!;
    const pairs = Array.from({ length: 120 }, (_, i) => ({ ...template, id: String(i), leftPath: `Folder/Join ${i}.md`, leftBasename: `<svg onload=alert(1)> Join ${i}` }));
    const comparison = { ...original, pairs, candidateCount: 120 };
    const port = { getSnapshot: () => ({ state: "ready" as const, comparison }), load: vi.fn(), refresh: vi.fn(), subscribe: vi.fn(), dispose: vi.fn() };
    const parent = new mocks.Element(), state = newConnectionComparisonViewState();
    renderConnectionComparison(parent as never, port, state, { back: vi.fn(), openNote: vi.fn(), explore: vi.fn() });
    const rows = () => parent.all().filter(e => e.attrs["data-health-action"]?.startsWith("connections-pair-"));
    expect(rows()).toHaveLength(50); expect(parent.texts()).toContain(t("@connections.showing", { shown: 50, total: 120 }));
    parent.action("connections-more").click(); expect(rows()).toHaveLength(100);
    parent.action("connections-search").input("JOIN 11"); expect(rows()).toHaveLength(11); expect(state.visibleLimit).toBe(50);
    expect(parent.texts()).toContain(t("@connections.showing", { shown: 11, total: 11 }));
    parent.action("connections-pair-0").click(); expect(parent.action("connections-pair-0").attrs["aria-pressed"]).toBe("true");
    expect(parent.texts()).toContain("<svg onload=alert(1)> Join 11");
    expect(parent.action("connections-pair-0").attrs["aria-label"]).toContain(t("@connections.rank", { note: "<svg onload=alert(1)> Join 11", rank: 1 }));
    for (const verdict of ["useful", "not-useful", "unsure"] as const) {
      parent.action(`connections-review-${verdict}`).click();
      expect(state.reviewByPairId.get("11")).toBe(verdict);
      expect(parent.action(`connections-review-${verdict}`).attrs["aria-pressed"]).toBe("true");
      expect(parent.ownerDocument.activeElement).toBe(parent.action(`connections-review-${verdict}`));
      expect(parent.action("connections-pair-0").texts()).toContain(t(`@connections.${verdict}`));
    }
    parent.action("connections-review-clear").click(); expect(state.reviewByPairId.size).toBe(0);
    parent.action("connections-rank-one-sided-top-5").click(); expect(rows()).toHaveLength(0);
    parent.action("connections-rank-mutual-top-3").click(); expect(rows()).toHaveLength(11);
    parent.action("connections-review-useful").click();
    parent.action("connections-review-filter-unreviewed").click(); expect(rows()).toHaveLength(10);
    expect(state.visibleLimit).toBe(50);
    expect(parent.texts()).not.toMatch(/@connections\./);
    expect(port.load).not.toHaveBeenCalled(); expect(port.refresh).not.toHaveBeenCalled();
  });
});


describe("safe pair opening", () => {
  it("resolves both Markdown endpoints before creating a new tab and public vertical split", async () => {
    const f = appFixture(), left = new mocks.TFile(), right = Object.assign(new mocks.TFile(), { path: "B.md" });
    const first = { openFile: vi.fn(async () => undefined) }, second = { openFile: vi.fn(async () => undefined) };
    f.workspace.getLeaf.mockReturnValue(first);
    const split = vi.fn(() => second); Object.assign(f.workspace, { createLeafBySplit: split });
    f.vault.getAbstractFileByPath.mockImplementation(path => path === "A.md" ? left : path === "B.md" ? right : null);
    for (const path of ["Missing.md", "../A.md", "Private/Config/secret.md"]) expect(await openHealthNotePair(f.app, "A.md", path)).toBe(false);
    right.extension = "canvas"; expect(await openHealthNotePair(f.app, "A.md", "B.md")).toBe(false); right.extension = "md";
    expect(f.workspace.getLeaf).not.toHaveBeenCalled();
    expect(await openHealthNotePair(f.app, "A.md", "B.md")).toBe(true);
    expect(f.workspace.getLeaf).toHaveBeenCalledWith("tab"); expect(split).toHaveBeenCalledWith(first, "vertical");
    expect(first.openFile).toHaveBeenCalledWith(left); expect(second.openFile).toHaveBeenCalledWith(right);
    split.mockClear(); first.openFile.mockImplementationOnce(async () => { f.vault.getAbstractFileByPath.mockReturnValue(null); return undefined; });
    expect(await openHealthNotePair(f.app, "A.md", "B.md")).toBe(false); expect(split).not.toHaveBeenCalled();
    for (const spy of [f.vault.read, f.adapter.write]) expect(spy).not.toHaveBeenCalled();
  });
});

describe("Stage 1 native home and scope boundaries", () => {
  it("opens the approved home with real metadata and preserves selection independently in two views", async () => {
    const f = fixture();
    f.vault.getAllFolders.mockReturnValue([{ path: "SQL" }, { path: "SQL/nested" }, { path: "SQL-old" }]);
    f.vault.getMarkdownFiles.mockReturnValue(["Root.md", "SQL/A.md", "SQL/nested/B.md", "SQL-old/C.md"].map(path => ({ ...f.note, path })));
    const other = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools);
    await f.view.onOpen(); await other.onOpen();
    const second = other.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(f.content.action("nav-home").attrs["aria-current"]).toBe("page");
    expect(f.content.action("scope-all").texts()).toContain("Notes: 4");
    f.content.action("scope-0").click();
    expect(f.content.action("scope-0").attrs["aria-pressed"]).toBe("true");
    expect(second.action("scope-all").attrs["aria-pressed"]).toBe("true");
    f.content.action("open-scope").click();
    expect(f.content.action("scope-note-0").text).toBe("SQL/A.md");
    expect(f.content.action("scope-note-1").text).toBe("SQL/nested/B.md");
    expect(f.content.action("scope-note-2")).toBeUndefined();
    expect(f.content.action("discover-search").disabled).toBe(true);
    f.content.action("nav-home").click(); expect(f.content.action("scope-0").attrs["aria-pressed"]).toBe("true");
    expect(f.vault.getMarkdownFiles).toHaveBeenCalledTimes(2);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(mocks.requestUrl).not.toHaveBeenCalled();
    await f.view.onClose(); await other.onClose(); expect(f.vault.offref).toHaveBeenCalledTimes(6);
  });
  it("requires an explicit scope handoff, rejects detached confirmation and keeps late failures out of the new scope", async () => {
    const f = fixture(); f.vault.getAllFolders.mockReturnValue([{ path: "SQL" }, { path: "Other" }]);
    await f.view.onOpen(); f.content.action("scope-1").click(); f.content.action("nav-process").click();
    f.content.action("tool-openBatchProcessing").click(); const old = f.content.action("scope-continue");
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
    f.content.action("scope-picker").input("Other"); old.click(); expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
    f.content.action("tool-openBatchProcessing").click(); const confirm = f.content.action("scope-continue"); confirm.click(); confirm.click(); expect(f.tools.openBatchProcessing).toHaveBeenCalledTimes(1);
    f.content.action("nav-tools").click(); let reject!: (error: Error) => void;
    f.tools.openDeepAudit.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    f.content.action("tool-openDeepAudit").click(); f.content.action("scope-continue").click();
    f.content.action("scope-picker").input("SQL"); reject(new Error("private response")); await flush();
    expect(f.content.texts()).not.toContain(t("@tools.launch-failed"));
    await f.view.onClose();
  });
  it("keeps unavailable storage/due state honest and supports missing folders without an All fallback", async () => {
    const f = fixture(); const handlers = new Map<string, (file: { path: string }, oldPath?: string) => void>();
    f.vault.on.mockImplementation((...args: unknown[]) => { handlers.set(args[0] as string, args[1] as never); });
    f.vault.getAllFolders.mockReturnValue([{ path: "SQL" }]); await f.view.onOpen();
    expect(f.content.texts()).toContain("Data unavailable");
    f.content.action("scope-0").click();
    expect(f.content.texts()).toContain("Folder queue not available yet");
    f.vault.getAllFolders.mockReturnValue([]); handlers.get("delete")!({ path: "SQL" }); await flush();
    expect(f.content.texts()).toContain("The selected folder was deleted or renamed");
    expect(f.content.action("open-scope").disabled).toBe(true);
    expect(f.content.action("scope-all").attrs["aria-pressed"]).toBe("false");
    f.content.action("scope-all").click(); expect(f.content.action("open-scope").disabled).toBe(false);
    await f.view.onClose();
  });
  it("exposes every omitted root folder through an explicit count and keeps the selected folder visible", async () => {
    const f = fixture();
    f.vault.getAllFolders.mockReturnValue(Array.from({ length: 11 }, (_, i) => ({ path: `Area ${String(i).padStart(2, "0")}` })));
    await f.view.onOpen();
    const more = f.content.action("home-more-folders");
    expect(more.text).toBe("5 more folders"); expect(more.attrs["aria-expanded"]).toBe("false");
    expect(f.content.all().filter(e => e.attrs["data-home-folder"])).toHaveLength(5);
    more.click(); expect(more.attrs["aria-expanded"]).toBe("true");
    f.content.action("home-folder-Area%2010").click();
    expect(f.content.action("scope-5").attrs["title"]).toBe("Area 10");
    expect(f.content.action("scope-5").attrs["aria-pressed"]).toBe("true");
    expect(f.content.all().filter(e => e.attrs["data-home-folder"])).toHaveLength(5);
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    await f.view.onClose();
  });
  it("keeps catalog details closed and preserves every launcher without choosing an editor", async () => {
    const f = fixture(); await f.view.onOpen(); f.content.action("nav-tools").click();
    const details = f.content.all().filter(e => e.tag === "details");
    expect(details.length).toBeGreaterThan(10); expect(details.every(e => !e.open)).toBe(true);
    for (const action of Object.keys(f.tools)) expect(f.content.action(`tool-${action}`)).toBeDefined();
    expect(f.content.action("editor-selection").parentElement!.texts()).toContain("Select text in the intended note");
    expect(f.content.all().filter(e => e.attrs["data-health-action"] === "tool-openOperationHistory")).toHaveLength(1);
    for (const work of Object.values(f.tools)) expect(work).not.toHaveBeenCalled();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    await f.view.onClose();
  });
  it("uses the owning document for motion lifecycle, including hidden documents and cleanup", async () => {
    const f = fixture(); const listeners = new Map<string, () => void>();
    let intersect!: (entries: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn(), observe = vi.fn();
    const owner = Object.assign(f.content.ownerDocument, {
      hidden: true, addEventListener: vi.fn((key: string, listener: () => void) => listeners.set(key, listener)),
      removeEventListener: vi.fn((key: string) => listeners.delete(key)),
      defaultView: { IntersectionObserver: class {
        constructor(callback: typeof intersect) { intersect = callback; } observe = observe; disconnect = disconnect;
      } },
    });
    await f.view.onOpen();
    expect(observe).toHaveBeenCalledWith(f.content);
    expect(f.content.attrs["data-document-hidden"]).toBe("true");
    owner.hidden = false; listeners.get("visibilitychange")!();
    expect(f.content.attrs["data-document-hidden"]).toBe("false");
    intersect([{ isIntersecting: false }]); expect(f.content.attrs["data-scene-visible"]).toBe("false");
    intersect([{ isIntersecting: true }]); expect(f.content.attrs["data-scene-visible"]).toBe("true");
    f.content.action("workspace-motion").click(); expect(f.content.action("workspace-motion").attrs["aria-pressed"]).toBe("false");
    expect(f.content.action("scope-all").all().some(e => e.cls === "veynrel-core-geometry" && e.attrs["aria-hidden"] === "true")).toBe(true);
    await f.view.onClose(); expect(disconnect).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0);
  });
  it("keeps all map entrances above notes, with explicit scope and inert blocked actions", async () => {
    const f = fixture(); f.vault.getAllFolders.mockReturnValue([{ path: "SQL" }]);
    await f.view.onOpen(); f.content.action("scope-0").click(); f.content.action("nav-discover").click();
    const all = f.content.all();
    for (const key of ["discover-search", "topology-open", "global-map-open", "connections-open"]) {
      expect(f.content.action(key).disabled).toBe(true);
      expect(f.content.action(key).attrs["aria-label"]).toMatch(/^Open: .+/u);
      expect(all.indexOf(f.content.action(key))).toBeLessThan(all.indexOf(f.content.action("scope-search")));
      f.content.action(key).click();
    }
    expect(f.content.texts()).toContain("Whole index");
    const stale = f.content.action("scope-continue"); f.content.action("nav-home").click(); stale.click();
    expect(f.content.action("scope-all")).toBeDefined();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    await f.view.onClose();
  });

});
