import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; cls = ""; tag = "div"; disabled = false; value = "";
    attrs: Record<string, string> = {}; listeners: Array<() => void> = [];
    ownerDocument: { activeElement: Element | null } = { activeElement: null };
    private append(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element {
      const child = new Element(); Object.assign(child, { tag, text: opts.text ?? "", cls: opts.cls ?? "", attrs: opts.attr ?? {}, ownerDocument: this.ownerDocument });
      this.children.push(child); return child;
    }
    createSvg(tag: string, opts: { cls?: string; attr?: Record<string, string> } = {}): Element { return this.append(tag, opts); }
    createEl(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append(tag, opts); }
    createDiv(opts: { cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("div", opts); }
    createSpan(opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("span", opts); }
    addClass(cls: string): void { this.cls += ` ${cls}`; }
    toggleClass(cls: string, enabled: boolean): void { if (enabled) this.addClass(cls); }
    empty(): void { this.children = []; this.text = ""; }
    setText(text: string): void { this.text = text; }
    setAttribute(key: string, value: string): void { this.attrs[key] = value; }
    getAttribute(key: string): string | null { return this.attrs[key] ?? null; }
    contains(child: Element): boolean { return this.all().includes(child); }
    querySelector(selector: string): Element | undefined {
      const attribute = selector.match(/^\[([\w-]+)\]$/u)?.[1];
      if (attribute) return this.all().find((e) => e.attrs[attribute] !== undefined);
      const action = selector.match(/="([^"]+)"/u)?.[1];
      return action ? this.all().find((e) => e.attrs["data-health-action"] === action) : undefined;
    }
    focus(): void { if (!this.disabled) this.ownerDocument.activeElement = this; }
    addEventListener(_type: string, fn: () => void): void { this.listeners.push(fn); }
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
import { setLanguage } from "../../i18n";
import { HealthPluginController } from "../obsidian/healthPluginController";
import { appFixture, flush, root, preferencesFixture } from "../obsidian/testSupport";
import type { HealthPreferences } from "../preferences";
import { VeynrelHealthView } from "./VeynrelHealthView";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { registerHealth } from "../obsidian/registerHealth";
import { openHealthView } from "../obsidian/openHealthView";
import { openHealthNote } from "../obsidian/openHealthNote";
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
import type { DeepHealthAnalysisPort, DeepKnowledgeAnalysis } from "../deepHealthAnalysisPort";
import { candidate } from "../store/testSupport";
import { withAbort } from "../analyzers/local/cancellation";

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
    const f = fixture(); await f.view.onOpen();
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
    f.content.action("tools").click(); expect(f.content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
  });
  it("close unsubscribes without cancelling; reopen reflects the same plugin-owned running scan", async () => {
    const f = fixture(); const realSubscribe = f.controller.subscribe.bind(f.controller);
    const removals: ReturnType<typeof vi.fn>[] = [];
    const subscribe = vi.spyOn(f.controller, "subscribe").mockImplementation((listener) => {
      const remove = vi.fn(realSubscribe(listener)); removals.push(remove); return remove;
    }); await f.view.onOpen();
    f.vault.read.mockReturnValueOnce(new Promise(() => {})); f.content.action("scan").click(); await flush();
    await f.view.onClose(); expect(f.content.children).toHaveLength(0); expect(removals[0]).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().busy).toBe(true);
    await f.view.onOpen(); expect(f.content.action("scan").disabled).toBe(true);
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
  it("rechecks note existence at click time and leaves Findings unchanged if the note disappeared", async () => {
    const f = fixture(); await f.view.onOpen(); await f.controller.runLocalScan();
    const service = await f.controller.getHealthService(); const before = service.listFindings();
    f.vault.getAbstractFileByPath.mockReturnValue(null);
    f.content.action("open-note").click(); await flush();
    expect(f.content.texts()).toContain("This note is no longer available"); expect(f.openFile).not.toHaveBeenCalled();
    expect(service.listFindings()).toEqual(before); expect(f.content.action("open-note")).toBeUndefined();
  });
  it("blocking recovery requires modal confirmation and Cancel leaves files untouched", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, "{bad"); await f.view.onOpen();
    expect(f.content.action("scan")).toBeUndefined(); f.content.action("recover").click();
    const modal = mocks.Modal.opened[0]; expect(modal.contentEl.texts()).toContain("does not delete or edit your notes");
    modal.contentEl.all().find((e) => e.text === "Cancel")!.click(); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.content.action("recover").click(); const confirmation = mocks.Modal.opened[1];
    confirmation.contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.action("scan")).toBeDefined());
    expect(f.content.texts()).toContain("Coverage not established"); expect(f.vault.read).not.toHaveBeenCalled();
  });
});

describe("inline Deep Intelligence boundaries", () => {
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
  function noWork(f: ReturnType<typeof deepFixture>) {
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.cachedRead).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
  }
  function knowledgeFixture() {
    const result: DeepKnowledgeAnalysis = { revision: { token: "opaque" }, complete: true, totalFiles: 1, analyzedFiles: 1,
      candidates: [candidate({ analyzerId: "knowledge-quality", dimension: "knowledge", source: "deep-ai", type: "knowledge-draft", impact: "review", confidence: "medium",
        notePaths: ["A.md"], title: "Knowledge note may need development", explanation: "Deep analysis suggests this note may be incomplete or underdeveloped.",
        evidence: [{ kind: "deep-quality", value: "draft", path: "A.md" }], actions: [{ kind: "open-note", path: "A.md" }] })] };
    const analysis = { getConsent: () => ({ configurationRevision: 1, providerKind: "cloud" as const }), analyzeKnowledge: vi.fn(async (_signal: AbortSignal) => {
      f.vault.getMarkdownFiles(); await f.cachedRead(); mocks.requestUrl(); return result;
    }), verifyCurrent: vi.fn(async () => {}) };
    const f = deepFixture(true, analysis); return { ...f, analysis, result };
  }
  it.each(["en", "ru"] as const)("Knowledge confirmation, cancel and navigation perform zero work in %s", async (language) => {
    setLanguage(language); const f = knowledgeFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen();
    f.content.action("deep-knowledge").click();
    expect(f.content.texts()).toContain(language === "en" ? "bounded note content" : "ограниченный объём");
    expect(f.content.texts()).toContain(language === "en" ? "costs" : "плату");
    expect(f.content.ownerDocument.activeElement?.attrs["data-knowledge-confirmation"]).toBe("true");
    noWork(f); expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled();
    const staleStart = f.content.action("knowledge-start");
    f.content.action("knowledge-back").click(); staleStart.click(); noWork(f);
    f.content.action("deep-knowledge").click(); f.content.action("nav-findings").click(); f.content.action("nav-health").click();
    expect(f.content.action("knowledge-start")).toBeUndefined(); staleStart.click(); noWork(f);
    await f.view.onClose(); expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled();
  });
  it.each(["en", "ru"] as const)("confirmed Knowledge creates one localized Finding and card filter in %s", async (language) => {
    setLanguage(language); const f = knowledgeFixture(); await f.view.onOpen();
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
    const f = knowledgeFixture(); await f.view.onOpen(); await f.second.onOpen(); let release!: (value: DeepKnowledgeAnalysis) => void;
    f.analysis.analyzeKnowledge.mockImplementationOnce((signal) => withAbort(new Promise<DeepKnowledgeAnalysis>((resolve) => { release = resolve; }), signal));
    f.content.action("deep-knowledge").click(); f.content.action("knowledge-start").click(); await flush();
    expect(f.content.texts()).toContain("Checking knowledge…"); expect(f.secondContent.action("knowledge-cancel")).toBeDefined();
    expect(f.content.action("scan").disabled).toBe(true); expect(f.content.action("deep-check").disabled).toBe(true);
    f.content.action("knowledge-cancel").click(); await flush();
    expect(f.controller.getState().deepScanRunning).toBe(false); expect(f.content.texts()).toContain("Knowledge check cancelled");
    expect(f.controller.listFindings()).toEqual([]); expect(f.controller.getState().deepOutcome?.scan.status).toBe("failed");
    await f.view.onClose(); release(f.result); await flush(); expect(f.content.children).toHaveLength(0);
    expect(f.controller.listFindings()).toEqual([]); expect(f.connection.test).not.toHaveBeenCalled();
  });
  it("Configured can analyze after restart, while Unconfigured/Busy/Error cannot; Check and Connect never analyze", async () => {
    const f = knowledgeFixture(); await f.view.onOpen();
    expect(f.content.action("deep-knowledge")).toBeDefined();
    f.connection.test.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_BODY"));
    f.content.action("deep-check").click(); await flush(); expect(f.content.action("deep-knowledge")).toBeUndefined();
    await f.deep.checkCurrentSetup(); expect(f.content.action("deep-knowledge")).toBeDefined();
    const draft = f.deep.createDraft("ollama"); await f.deep.connect(draft);
    expect(f.analysis.analyzeKnowledge).not.toHaveBeenCalled(); expect(f.controller.listFindings()).toEqual([]);
    noWork(f); f.change({ model: "" }); expect(f.content.action("deep-knowledge")).toBeUndefined();
  });
  it.each([true, false])("passive legacy configuration is safe and does no work (configured: %s)", async (configured) => {
    const f = deepFixture(configured); await f.view.onOpen();
    expect(f.content.texts()).toContain(configured ? "Configured" : "Not configured");
    const publicValues = JSON.stringify([f.deep.getSnapshot(), f.controller.getState(), deepIntelligenceViewModel(f.deep.getSnapshot()),
      f.content.all().map((element) => ({ text: element.text, value: element.value, attrs: element.attrs }))]);
    expect(publicValues.includes("synthetic-DO-NOT-EXPOSE-key")).toBe(false);
    expect(f.content.all().find((element) => element.attrs["data-dimension"] === "knowledge")?.texts()).toContain("Not enabled");
    f.content.action("nav-findings").click(); f.content.action("nav-discover").click(); f.content.action("nav-health").click();
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it.each(["en", "ru"] as const)("localizes chooser/forms/errors and keeps all inputs labelled in %s", async (language) => {
    setLanguage(language); const f = deepFixture(false); await f.view.onOpen();
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
    const f = deepFixture(); await f.view.onOpen(); f.content.action("deep-change").click(); f.content.action("deep-provider-openrouter").click();
    const key = f.content.action("deep-field-apiKey"); expect(key.value === f.settings.get().apiKey).toBe(true);
    expect(key.attrs.type).toBe("password"); expect(f.content.texts().includes(key.value)).toBe(false);
    key.input("synthetic-discarded-draft"); f.content.action("deep-back").click();
    f.content.action("deep-change").click(); f.content.action("deep-provider-openrouter").click();
    expect(f.content.action("deep-field-apiKey").value === "synthetic-discarded-draft").toBe(false);
    expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it("an already-open form cannot overwrite a newer Advanced edit", async () => {
    const f = deepFixture(); await f.view.onOpen(); f.content.action("deep-change").click(); f.content.action("deep-provider-ollama").click();
    f.change({ model: "new-advanced-model" }); f.content.action("deep-connect").click(); await flush();
    expect(f.settings.get().model).toBe("new-advanced-model"); expect(f.content.texts()).toContain("Couldn't save");
    expect(f.connection.test).not.toHaveBeenCalled(); expect(f.settings.update).not.toHaveBeenCalled(); noWork(f);
  });
  it.each([false, true])("Deep status never hides subsequent Health scan feedback (failed check: %s)", async (failed) => {
    const f = deepFixture(); await f.view.onOpen();
    if (failed) f.connection.test.mockRejectedValueOnce(new Error("fixture"));
    await f.deep.checkCurrentSetup(); await f.controller.runLocalScan();
    const status = f.content.all().find((element) => element.attrs.role === "status")!.text;
    expect(status).toContain("Vault check complete"); expect(status).toContain(failed ? "Connection failed" : "Connected");
  });
  it("two views share Busy/Ready/Error and Advanced changes; closing one only removes its subscription", async () => {
    const f = deepFixture(); await f.view.onOpen(); await f.second.onOpen(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    f.content.action("deep-check").click();
    expect(f.content.texts()).toContain("Checking…"); expect(f.secondContent.texts()).toContain("Checking…");
    expect(f.secondContent.action("deep-check").disabled).toBe(true); expect(f.secondContent.action("deep-change").disabled).toBe(true);
    expect(f.secondContent.action("scan").disabled).toBe(false); expect(f.secondContent.action("nav-findings").disabled).toBe(false);
    release(); await flush(); expect(f.secondContent.texts()).toContain("Connected"); expect(f.settings.update).not.toHaveBeenCalled();
    f.connection.test.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    f.secondContent.action("deep-check").click(); await flush();
    expect(f.content.texts()).toContain("Connection failed"); expect(f.secondContent.texts()).toContain("Connection failed");
    expect(f.content.texts()).not.toContain("synthetic-DO-NOT-EXPOSE-key");
    await f.view.onClose(); f.change({ model: "advanced-model" });
    expect(f.content.children).toHaveLength(0); expect(f.secondContent.texts()).toContain("OpenRouter · advanced-model");
    expect(f.secondContent.texts()).toContain("Configured"); expect(f.connection.test).toHaveBeenCalledTimes(2); noWork(f);
  });
  it.each(["navigate", "close", "back"] as const)("late Connect may save but cannot resurrect a form after %s", async (action) => {
    const f = deepFixture(false); await f.view.onOpen(); await f.second.onOpen(); let release!: () => void;
    f.connection.test.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    f.content.action("deep-setup").click(); f.content.action("deep-provider-ollama").click();
    f.content.action("deep-field-model").input("chosen-model"); f.content.action("deep-connect").click();
    expect(f.content.action("deep-connect").disabled).toBe(true); expect(f.secondContent.texts()).toContain("Connecting…");
    if (action === "navigate") f.content.action("nav-findings").click();
    else if (action === "close") await f.view.onClose();
    else f.content.action("deep-back").click();
    release(); await flush(); expect(f.settings.get().model).toBe("chosen-model"); expect(f.settings.update).toHaveBeenCalledTimes(1);
    expect(f.content.action("deep-field-model")).toBeUndefined(); expect(f.secondContent.texts()).toContain("Connected");
    if (action === "close") expect(f.content.children).toHaveLength(0);
    if (action === "navigate") expect(f.content.action("nav-findings").attrs["aria-current"]).toBe("page");
    noWork(f);
  });
  it.each(["connection", "save"] as const)("failed %s keeps the form and committed configuration with safe feedback", async (failure) => {
    const f = deepFixture(); await f.view.onOpen(); const before = f.settings.get();
    if (failure === "connection") f.connection.test.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    else f.settings.update.mockRejectedValueOnce(new Error("synthetic-DO-NOT-EXPOSE-key"));
    f.content.action("deep-change").click(); f.content.action("deep-provider-ollama").click();
    f.content.action("deep-connect").click(); await flush();
    expect(f.settings.get()).toEqual(before); expect(f.content.action("deep-field-model")).toBeDefined();
    expect(f.content.texts()).toContain(failure === "connection" ? "Couldn't connect" : "Couldn't save");
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

  it.each([
    [false, "not-initialized", 0], [true, "not-initialized", 0], [true, "ready", 4],
    [true, "incompatible", 4], [true, "error", 0], [true, "ready", 0], [true, "indexing", 4],
  ] as const)("Discover navigation is passive (enabled %s, %s, %s vectors)", async (enabled, kind, count) => {
    const f = semanticFixture(enabled, kind, count); await f.view.onOpen();
    expect(f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("nav-")).map((e) => e.text))
      .toEqual(["Health", "Findings", "Discover", "Tools", "Settings"]);
    f.content.action("nav-discover").click();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page");
    expect(f.content.all().find((e) => e.tag === "h1")?.text).toBe("Discover");
    expect(f.content.ownerDocument.activeElement?.text).toBe("Discover");
    expect(f.content.all().find((e) => e.tag === "nav")?.attrs["aria-label"]).toBe("Veynrel navigation");
    f.content.action("nav-findings").click(); expect(f.content.action("state-open")).toBeDefined();
    f.content.action("nav-discover").click(); f.content.action("nav-health").click(); expect(f.content.action("scan")).toBeDefined();
    f.content.action("nav-discover").click(); await f.view.onClose(); await f.view.onOpen();
    expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
    expect(f.engine.openSearch).not.toHaveBeenCalled(); expect(f.engine.openSimilarNotes).not.toHaveBeenCalled();
    expect(f.engine.openPotentialDuplicates).not.toHaveBeenCalled();
    expect(f.engine.findPotentialDuplicates).not.toHaveBeenCalled(); expect(f.semanticScan).not.toHaveBeenCalled();
    expect(Boolean(f.content.action("semantic-health-scan"))).toBe(false); // Reopened on Health, never auto-run.
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.adapter.write).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it.each(["en", "ru"] as const)("explicit Semantic Health scan produces localized Inbox Findings in %s and preserves dismissal on repeat", async (language) => {
    setLanguage(language); const f = semanticFixture(true, "ready", 8);
    const pair: SemanticDuplicatePair = { leftPath: "B.md", rightPath: "A.md", score: 0.971, leftMatches: [], rightMatches: [] };
    f.engine.findPotentialDuplicates.mockResolvedValue([pair]);
    await f.view.onOpen(); f.content.action("nav-discover").click();
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
    f.content.action("nav-findings").click();
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
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.adapter.write.mock.calls.every(([path]) => path.startsWith(`${root}/`))).toBe(true);
    await f.view.onClose();
  });

  it("shows semantic busy state across close/reopen, excludes Local scans and leaves exploratory workflows usable", async () => {
    const f = semanticFixture(true, "ready", 8); await f.view.onOpen(); f.content.action("nav-discover").click();
    let release!: (pairs: SemanticDuplicatePair[]) => void;
    f.engine.findPotentialDuplicates.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const button = f.content.action("semantic-health-scan"); button.click(); button.click(); await flush();
    expect(f.content.action("semantic-health-scan").disabled).toBe(true);
    expect(f.content.texts()).toContain("Checking semantic duplicates…");
    expect(f.content.texts()).not.toContain("%");
    f.content.action("discover-duplicates").click(); expect(f.engine.openPotentialDuplicates).toHaveBeenCalledTimes(1);
    await f.view.onClose(); await f.view.onOpen();
    expect(f.content.action("scan").disabled).toBe(true); expect(f.content.action("scan").text).not.toBe("Checking your vault…");
    f.content.action("nav-discover").click(); expect(f.content.action("semantic-health-scan").disabled).toBe(true);
    release([]); await vi.waitFor(() => expect(f.controller.getState().busy).toBe(false));
    expect(f.engine.findPotentialDuplicates).toHaveBeenCalledTimes(1); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.content.action("semantic-health-scan").disabled).toBe(false); await f.view.onClose();
  });

  it("reports partial/failure safely and never starts Health analysis after Build", async () => {
    const f = semanticFixture(true, "not-initialized"); await f.view.onOpen(); f.content.action("nav-discover").click();
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
    f.files.set(`${root}/findings.json`, bytes); await f.view.onOpen();
    const findings = f.controller.listFindings(); const health = f.controller.getState().snapshot;
    const actions = [["search", "openSearch"], ["related", "openSimilarNotes"], ["duplicates", "openPotentialDuplicates"]] as const;
    const delegates = actions.map(([, method]) => vi.spyOn(f.semantic, method));
    f.content.action("nav-discover").click();
    expect(f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("discover-")).map((e) => e.attrs["data-health-action"]))
      .toEqual(["discover-search", "discover-related", "discover-duplicates"]);
    for (const [id, method] of actions) {
      const button = f.content.action(`discover-${id}`); expect(button.tag).toBe("button"); button.focus(); button.click();
      expect(f.engine[method]).toHaveBeenCalledExactlyOnceWith();
    }
    for (const delegate of delegates) expect(delegate).toHaveBeenCalledExactlyOnceWith();
    f.content.action("nav-findings").click(); f.content.action("state-dismissed").click();
    expect(f.content.action(`finding-${item.id}`)).toBeDefined();
    expect(f.files.get(`${root}/findings.json`)).toBe(bytes); expect(f.controller.listFindings()).toEqual(findings);
    expect(f.controller.getState().snapshot).toEqual(health); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.content.texts()).not.toContain("Ask your Vault"); await f.view.onClose();
  });

  it("disabled Discover reuses Health setup and Back discards edits without network or saves", async () => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Local Health continues to work without it");
    f.content.action("discover-enable").click();
    expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
    f.content.action("semantic-mode-cloud").click(); f.content.action("semantic-field-apiKey").input("synthetic-discarded-draft");
    f.content.action("semantic-back").click(); expect(f.content.action("scan")).toBeDefined();
    f.content.action("nav-discover").click(); f.content.action("discover-enable").click(); f.content.action("semantic-mode-cloud").click();
    expect(f.content.action("semantic-field-apiKey").value === "synthetic-discarded-draft").toBe(false);
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.settings.update.mock.calls.length).toBe(0);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it.each(["not-initialized", "ready"] as const)("%s without vectors builds only on click and updates Discover to Ready", async (kind) => {
    const f = semanticFixture(true, kind); await f.view.onOpen(); f.content.action("nav-discover").click();
    expect(f.content.action("discover-search")).toBeUndefined(); expect(f.engine.indexVault).not.toHaveBeenCalled();
    expect(Boolean(f.content.action("discover-check"))).toBe(kind === "not-initialized");
    f.content.action("discover-build").click(); await flush();
    expect(f.engine.indexVault).toHaveBeenCalledExactlyOnceWith(); expect(f.content.action("discover-search")).toBeDefined();
    expect(f.content.action("nav-discover").attrs["aria-current"]).toBe("page"); await f.view.onClose();
  });

  it("incompatible Discover rebuilds only on click; Change reuses Health setup", async () => {
    const f = semanticFixture(true, "incompatible", 8); await f.view.onOpen(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Index needs rebuilding"); expect(f.content.action("discover-search")).toBeUndefined();
    expect(f.engine.rebuildIndex).not.toHaveBeenCalled(); f.content.action("discover-change").click();
    expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page"); expect(f.content.action("semantic-mode-local")).toBeDefined();
    f.content.action("semantic-back").click(); f.content.action("nav-discover").click(); f.content.action("discover-rebuild").click();
    await flush(); expect(f.engine.rebuildIndex).toHaveBeenCalledExactlyOnceWith(); await f.view.onClose();
  });

  it("error and busy Discover show safe status, prevent duplicate checks and leave Local Health browsable", async () => {
    const f = semanticFixture(true, "error"); await f.view.onOpen(); f.content.action("nav-discover").click();
    expect(f.content.texts()).toContain("Semantic Intelligence needs attention");
    expect(f.content.action("discover-change")).toBeDefined(); expect(f.content.action("discover-search")).toBeUndefined();
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
    setLanguage("ru"); const f = semanticFixture(true, "ready", 8); await f.view.onOpen(); f.content.action("nav-discover").click();
    expect(f.content.action("nav-discover").text).toBe("Открытия"); expect(f.content.texts()).toContain("Связанные заметки");
    expect(f.content.texts()).toContain("Возможные дубликаты"); expect(f.content.texts()).toContain(f.settings.get().embeddingModel);
    expect(f.content.texts()).not.toMatch(/@discover|@semantic/u); await f.view.onClose();
  });

  it.each([false, true])("opening Health (enabled %s) never tests, reads notes, indexes or changes the four local dimensions", async (enabled) => {
    const f = semanticFixture(enabled); await f.view.onOpen();
    expect(mocks.requestUrl).not.toHaveBeenCalled(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.scan).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    expect(f.content.all().filter((e) => e.attrs["data-dimension"])).toHaveLength(4);
    expect(f.content.action(enabled ? "semantic-check" : "semantic-enable")).toBeDefined();
    expect(f.content.action("scan").disabled).toBe(false);
    if (enabled) { f.content.action("semantic-check").click(); await flush(); expect(f.engine.refreshSemanticStatus).toHaveBeenCalledTimes(1); }
    await f.view.onClose();
  });

  it.each(["local", "cloud", "custom"] as const)("choosing/editing %s is transient; Back discards it without side effects", async (mode) => {
    const f = semanticFixture(); await f.view.onOpen(); const previous = JSON.stringify(f.settings.get());
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
    const f = semanticFixture(); await f.view.onOpen();
    f.content.action("semantic-enable").click(); f.content.action(`semantic-mode-${mode}`).click();
    if (mode !== "local") f.content.action("semantic-field-apiKey").input("synthetic-key");
    f.content.action("semantic-connect").click();
    expect(f.content.action("semantic-connect").disabled).toBe(true); expect(f.content.action("semantic-mode-cloud").disabled).toBe(true);
    await vi.waitFor(() => expect(f.content.texts()).toContain("Index required"));
    expect(f.content.texts()).not.toContain("Semantic Intelligence ready"); expect(f.content.action("semantic-search")).toBeUndefined();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.scan).not.toHaveBeenCalled();
    expect(f.engine.indexVault).not.toHaveBeenCalled(); expect(f.settings.update).toHaveBeenCalledTimes(1);
    expect(f.controller.listFindings()).toEqual([]);
    f.content.action("semantic-build").click(); await vi.waitFor(() => expect(f.content.action("semantic-search")).toBeDefined());
    expect(f.engine.indexVault).toHaveBeenCalledTimes(1); f.content.action("semantic-search").click();
    expect(f.engine.openSearch).toHaveBeenCalledTimes(1); expect(f.scan).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it("existing Ready users search immediately; Change setup and Back retain Ready; Advanced edits are reread", async () => {
    const f = semanticFixture(true, "ready", 8); await f.view.onOpen();
    expect(f.content.texts()).toContain("Semantic Intelligence ready"); expect(f.content.texts()).toContain("8 vectors");
    expect(f.content.action("semantic-mode-local")).toBeUndefined(); f.content.action("semantic-search").click();
    f.content.action("semantic-change").click(); f.content.action("semantic-mode-cloud").click(); f.content.action("semantic-back").click();
    expect(f.content.action("semantic-search")).toBeDefined(); expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled();
    await f.settings.update({ ...f.settings.get(), embeddingModel: "advanced-model" });
    f.content.action("nav-findings").click(); f.content.action("nav-health").click();
    expect(f.content.texts()).toContain("advanced-model"); expect(f.scan).not.toHaveBeenCalled(); expect(mocks.requestUrl).not.toHaveBeenCalled();
    await f.view.onClose();
  });

  it("incompatible status offers only explicit rebuild, without Clear or semantic Findings", async () => {
    const f = semanticFixture(true, "incompatible", 8); await f.view.onOpen();
    expect(f.content.texts()).toContain("Index needs rebuilding"); expect(f.engine.rebuildIndex).not.toHaveBeenCalled();
    expect(f.content.action("semantic-build")).toBeUndefined(); expect(f.content.texts()).not.toContain("Clear index");
    f.content.action("semantic-rebuild").click(); await flush(); expect(f.engine.rebuildIndex).toHaveBeenCalledTimes(1);
    expect(f.controller.listFindings()).toEqual([]); expect(f.scan).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it("failed tests and saves retain drafts for retry with fixed safe copy", async () => {
    const f = semanticFixture(); await f.view.onOpen(); f.content.action("semantic-enable").click(); f.content.action("semantic-mode-local").click();
    mocks.requestUrl.mockRejectedValueOnce(new Error("private-provider-response")); f.content.action("semantic-connect").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't connect to Ollama"));
    f.settings.update.mockRejectedValueOnce(new Error("private-save-response")); f.content.action("semantic-connect").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Semantic Intelligence settings"));
    expect(f.content.texts()).not.toContain("private-"); expect(f.settings.get().enabled).toBe(false);
    expect(f.engine.refreshSemanticStatus).not.toHaveBeenCalled(); await f.view.onClose();
  });

  it("closing discards the route and subscription; a late Connect cannot reopen it", async () => {
    const f = semanticFixture(); const remove = vi.fn(); const subscribe = f.semantic.subscribe.bind(f.semantic);
    vi.spyOn(f.semantic, "subscribe").mockImplementation((listener) => { const unsubscribe = subscribe(listener); return () => { remove(); unsubscribe(); }; });
    await f.view.onOpen(); f.content.action("semantic-enable").click(); f.content.action("semantic-mode-local").click();
    let release!: (value: unknown) => void; mocks.requestUrl.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    f.content.action("semantic-connect").click(); await flush(); await f.view.onClose(); expect(remove).toHaveBeenCalledTimes(1);
    release({ status: 200, text: '{"embeddings":[[1,0,0]]}' }); await flush(); await f.view.onOpen();
    expect(f.content.action("semantic-mode-local")).toBeUndefined(); expect(f.content.action("semantic-check")).toBeDefined();
    expect(f.content.texts()).not.toContain("Semantic Intelligence connected"); await f.view.onClose();
  });

  it("Russian setup uses localized copy while preserving provider/model identifiers", async () => {
    setLanguage("ru"); const f = semanticFixture(); await f.view.onOpen();
    expect(f.content.texts()).toContain("Семантические возможности"); f.content.action("semantic-enable").click();
    for (const mode of ["local", "cloud", "custom"] as const) { f.content.action(`semantic-mode-${mode}`).click(); expect(f.content.texts()).not.toContain("@semantic"); }
    expect(f.content.texts()).toContain("Базовый URL"); expect(f.content.texts()).toContain("OpenAI"); await f.view.onClose();
  });
});

describe("integrated Health onboarding", () => {
  it("asks one question, resumes after reopen without reading notes, scans only on click and keeps one live region", async () => {
    const f = fixture({}); await f.view.onOpen();
    expect(f.content.texts()).toContain("Welcome to Veynrel");
    expect(f.content.action("nav-findings")).toBeUndefined();
    expect(f.content.action("nav-discover")).toBeUndefined();
    expect(f.content.all().filter((e) => e.tag === "button" && e.attrs["data-health-action"]?.startsWith("profile-"))).toHaveLength(5);
    expect(f.content.action("scan")).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    const live = f.content.all().find((e) => e.attrs.role === "status");
    const choice = f.content.action("profile-research"); choice.focus(); choice.click();
    await vi.waitFor(() => expect(f.content.action("scan")).toBeDefined());
    expect(f.preferences.get()).toMatchObject({ profile: "research", profileChosen: true, onboardingCompleted: false });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.content.all().find((e) => e.attrs.role === "status")).toBe(live);
    expect(f.content.ownerDocument.activeElement?.tag).toBe("h1");
    await f.view.onClose(); await f.view.onOpen();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("scan")).toBeDefined(); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("scan").click(); const pending = f.controller.runLocalScan();
    expect(f.preferences.get().onboardingCompleted).toBe(false); await pending;
    expect(f.content.texts()).toContain("Veynrel found something"); expect(f.content.texts()).toContain("Note without connections");
    expect(f.content.action("continue")).toBeDefined(); expect(f.content.action("tools")).toBeUndefined();
    expect(f.content.action("nav-findings")).toBeUndefined();
    expect(f.preferences.get().onboardingCompleted).toBe(false);
    f.content.action("continue").click(); await vi.waitFor(() => expect(f.content.action("tools")).toBeDefined());
    expect(f.preferences.get().onboardingCompleted).toBe(true); expect(f.vault.read).toHaveBeenCalledTimes(1);
    expect(f.content.action("nav-findings")).toBeDefined();
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("tools")).toBeDefined();
    expect(f.content.all().filter((e) => e.attrs.role === "status")).toHaveLength(1);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
  });
  it("Skip saves Mixed, permanently exits onboarding and never scans", async () => {
    const f = fixture({}); await f.view.onOpen(); f.content.action("skip").click();
    await vi.waitFor(() => expect(f.content.action("tools")).toBeDefined());
    expect(f.preferences.get()).toEqual({ profile: "mixed", profileChosen: true, onboardingCompleted: true, onboardingVersion: 1 });
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("skip")).toBeUndefined();
    expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("migrating an existing scan uses it immediately after profile selection and derives Result after restart", async () => {
    const f = fixture({}); await f.controller.runLocalScan(); f.controller.dispose(); f.vault.read.mockClear();
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const view = new VeynrelHealthView({ app: f.app } as never, controller, f.tools); await view.onOpen();
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
    const f = fixture({}); await f.view.onOpen(); f.save.mockRejectedValue(new Error("private details"));
    f.content.action("profile-work").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.action("profile-work")).toBeDefined(); expect(f.preferences.get().profileChosen).toBe(false);
    f.content.action("skip").click(); await flush(); expect(f.preferences.get().onboardingCompleted).toBe(false);
    expect(f.content.texts()).not.toContain("private details");
    const result = fixture({ profileChosen: true }); await result.view.onOpen(); await result.controller.runLocalScan();
    result.save.mockRejectedValueOnce(new Error("private details")); result.content.action("continue").click();
    await vi.waitFor(() => expect(result.content.texts()).toContain("Couldn't save Health preferences"));
    expect(result.content.action("continue")).toBeDefined(); expect(result.content.action("tools")).toBeUndefined();
    expect(result.preferences.get().onboardingCompleted).toBe(false); expect(result.content.texts()).not.toContain("private details");
    result.content.action("continue").click(); await vi.waitFor(() => expect(result.content.action("tools")).toBeDefined());
  });
  it("Change profile is secondary, shows a non-color selected marker, has no Skip and never scans", async () => {
    const f = fixture({ profile: "work", profileChosen: true, onboardingCompleted: true }); await f.view.onOpen();
    f.content.action("change-profile").click();
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-work").texts()).toContain("✓ Selected"); expect(f.content.action("skip")).toBeUndefined();
    f.save.mockRejectedValueOnce(new Error("private detail")); f.content.action("profile-research").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-research").attrs["aria-pressed"]).toBe("false");
    f.content.action("profile-research").click(); await vi.waitFor(() => expect(f.content.action("profile-research")).toBeUndefined());
    expect(f.content.texts()).toContain("Profile: Research & writing");
    expect(f.preferences.get().onboardingCompleted).toBe(true); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("tools").click(); expect(f.content.action("nav-tools").attrs["aria-current"]).toBe("page");
    expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
  });
  it.each(["findings.json", "scan-runs.json"])("recovery of %s wins before Welcome and preserves preferences", async (file) => {
    const f = fixture({ profile: "research" }); f.files.set(`${root}/${file}`, "{bad"); await f.view.onOpen();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("profile-research")).toBeUndefined();
    const preferences = f.preferences.get(); f.content.action("recover").click();
    mocks.Modal.opened[0].contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Welcome"));
    expect(f.preferences.get()).toEqual(preferences); expect(f.save).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("Russian first-result copy localizes the selected Finding while retaining its stored text", async () => {
    setLanguage("ru"); const f = fixture({ profileChosen: true }); await f.view.onOpen(); await f.controller.runLocalScan();
    expect(f.content.texts()).toContain("Заметка без связей"); expect(f.content.texts()).not.toContain("Note has no");
    const finding = f.controller.getState().recommendationFinding!;
    expect(finding.title).not.toMatch(/[А-Яа-яЁё]/u); expect(f.content.action("continue").text).toBe("Перейти в Health");
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
    const f = fixture(); await f.view.onOpen(); await f.controller.runLocalScan();
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
    f.content.action("nav-findings").click(); f.content.action("state-dismissed").click(); f.content.action(`finding-${id}`).click();
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
    expect(f.controller.getFinding(id)?.state).toBe("open"); expect(f.files.get(`${root}/findings.json`)).toBe(bytes);
    expect(f.content.texts()).not.toContain("PRIVATE"); expect(JSON.stringify(f.controller.getState())).not.toContain("PRIVATE");
    return { ...f, id };
  }
  it("leaving a failed Dismiss for Health clears the error and returning to the same Finding never resurrects it", async () => {
    const f = await failedDismiss(); f.content.action("nav-health").click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.content.texts()).toContain("Vault check complete");
    f.content.action("nav-findings").click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    f.content.action(`finding-${f.id}`).click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  it.each(["state-dismissed", "filter-connections", "another-finding"])("%s ends the failed interaction without resurrecting its status on return", async (destination) => {
    const f = fixture(); f.vault.getMarkdownFiles.mockReturnValue([f.note, { ...f.note, path: "B.md", basename: "B" }]);
    await f.view.onOpen(); await f.controller.runLocalScan();
    const id = f.controller.getState().recommendationFinding!.id;
    const other = f.controller.listFindings().find((finding) => finding.id !== id)!;
    f.content.action("review-finding").click(); f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE STORAGE ERROR"));
    f.content.action("finding-dismiss").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't update this finding."));
    f.content.action(destination === "another-finding" ? `finding-${other.id}` : destination).click();
    expect(f.content.texts()).not.toContain("Couldn't update this finding.");
    f.content.action("nav-findings").click(); f.content.action(`finding-${id}`).click();
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
    else { await f.view.onClose(); await f.view.onOpen(); }
    f.content.action("nav-findings").click(); f.content.action(`finding-${id}`).click();
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
    await f.view.onOpen(); f.content.action("nav-findings").click(); f.content.action(`finding-${item.id}`).click();
    const before = f.controller.listFindings(); f.content.action("finding-note-0").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.content.action("finding-note-1").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.vault.getAbstractFileByPath.mockReturnValue(null); f.content.action("finding-note-0").click(); await flush();
    expect(f.content.texts()).toContain("This note is no longer available"); expect(f.controller.listFindings()).toEqual(before);
    expect(f.content.texts()).not.toMatch(/fix-link|Delete|Fix automatically/u); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });
  it("bounds representative paths to ten, expands/collapses them, resets expansion and route when reopened", async () => {
    const f = fixture(); const item = inboxFinding({ type: "exact-duplicate-group", notePaths: Array.from({ length: 100 }, (_, i) => `Note${i}.md`),
      evidence: [{ kind: "member-count", value: 105 }, { kind: "represented-path-count", value: 100 }] });
    f.files.set(`${root}/findings.json`, serializeHealth({ version: 1, updatedAt: 10, findings: { [item.id]: item } }));
    await f.view.onOpen(); f.content.action("nav-findings").click(); f.content.action(`finding-${item.id}`).click();
    expect(f.content.texts()).toContain("105 notes affected"); expect(f.content.texts()).toContain("Showing 100 representative paths");
    expect(f.content.action("finding-note-9")).toBeDefined(); expect(f.content.action("finding-note-10")).toBeUndefined();
    f.content.action("finding-paths").click(); expect(f.content.action("finding-note-99")).toBeDefined();
    f.content.action("finding-paths").click(); expect(f.content.action("finding-note-10")).toBeUndefined();
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("view-findings")).toBeDefined(); expect(f.content.action("finding-dismiss")).toBeUndefined();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
  });
  it.each(["findings.json", "scan-runs.json"])("%s recovery dominates completed onboarding and prevents Inbox navigation", async (file) => {
    const f = fixture(); f.files.set(`${root}/${file}`, "invalid"); await f.view.onOpen();
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
  function passive(f: ReturnType<typeof connectFixture>) {
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(f.engine.syncCurrent).not.toHaveBeenCalled(); expect(f.engine.openProposalReview).not.toHaveBeenCalled();
  }
  it.each(["en", "ru"] as const)("Connect opens passively with localized capabilities, credential distinction and no direct writes in %s", async (language) => {
    setLanguage(language); const f = connectFixture(); await f.view.onOpen();
    f.content.action("nav-connect").click(); passive(f); expect(f.engine.test).not.toHaveBeenCalled();
    expect(f.content.action("nav-connect").attrs["aria-current"]).toBe("page");
    expect(f.content.texts()).not.toMatch(/@connect|PRIVATE_CONNECT_TOKEN|22222222/u);
    expect(f.content.texts()).toContain(language === "en" ? "They do not read live Obsidian memory" : "не имеют доступа к текущему состоянию Obsidian");
    expect(f.content.texts()).toContain(language === "en" ? "does not delete data already stored" : "не удаляет уже сохранённые");
    expect(f.content.texts()).toContain(language === "en" ? "Only explicit review and approval" : "только после явного просмотра и одобрения");
    expect(f.content.texts()).toContain(language === "en" ? "MCP clients authenticate to Companion separately" : "MCP-клиенты проходят отдельную аутентификацию");
    f.content.action("connect-review").click(); expect(f.engine.openProposalReview).toHaveBeenCalledTimes(1);
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("Sync now discloses exact data, Cancel/navigation/detached confirm do no work, and confirmation is single flight", async () => {
    const f = connectFixture(); await f.view.onOpen(); f.content.action("nav-connect").click();
    f.content.action("connect-sync").click(); passive(f);
    expect(f.content.ownerDocument.activeElement?.attrs["data-connect-confirmation"]).toBe("true");
    for (const text of ["Stable Vault identity", "Vault-relative", "Markdown content", "Chunk text", "source metadata", "Embeddings", "Semantic descriptor"])
      expect(f.content.texts()).toContain(text);
    const stale = f.content.action("connect-sync-confirm"); f.content.action("connect-sync-cancel").click(); stale.click(); passive(f);
    f.content.action("connect-sync").click(); const detached = f.content.action("connect-sync-confirm");
    f.content.action("nav-findings").click(); detached.click(); passive(f);
    f.content.action("nav-connect").click(); expect(f.content.action("connect-sync-confirm")).toBeUndefined();
    f.content.action("connect-sync").click(); const confirm = f.content.action("connect-sync-confirm"); confirm.click(); confirm.click(); await flush();
    expect(f.engine.syncCurrent).toHaveBeenCalledTimes(1); expect(f.vault.read).not.toHaveBeenCalled();
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("Remote form discloses storage before enabling, uses password-only token and clears token on server changes", async () => {
    const f = connectFixture(); await f.view.onOpen(); f.content.action("nav-connect").click(); f.content.action("connect-setup").click();
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
    const f = connectFixture(false); await f.view.onOpen(); f.content.action("nav-connect").click();
    f.content.action("connect-setup").click(); f.content.action("connect-mode-local").click();
    expect(f.content.action("connect-field-endpoint")).toBeUndefined();
    f.engine.test.mockRejectedValueOnce(new Error("PRIVATE_CONNECT_TOKEN raw response"));
    f.content.action("connect-submit").click(); await flush();
    expect(f.content.action("connect-field-token").value).toBe("PRIVATE_CONNECT_TOKEN");
    expect(f.content.texts()).not.toMatch(/PRIVATE_CONNECT_TOKEN|raw response/u); expect(f.settings.update).not.toHaveBeenCalled();
    let release!: () => void; f.engine.test.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    f.content.action("connect-submit").click(); f.content.action("nav-health").click(); release(); await flush();
    expect(f.content.action("connect-field-token")).toBeUndefined();
    f.content.action("nav-connect").click(); expect(f.content.texts()).toContain("Connected");
    expect(f.content.action("connect-field-token")).toBeUndefined();
    await f.view.onClose(); f.connect.dispose(); f.controller.dispose();
  });
  it("two views share status and one Check; closing one leaves the other subscribed", async () => {
    const f = connectFixture(); await Promise.all([f.view.onOpen(), f.second.onOpen()]);
    f.content.action("nav-connect").click(); f.secondContent.action("nav-connect").click(); passive(f);
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
    for (const name of ["read", "cachedRead", "getMarkdownFiles", "modify", "create"] as const) expect(Reflect.get(f.vault, name)).not.toHaveBeenCalled();
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
    expect(mocks.requestUrl).not.toHaveBeenCalled();
  }
  it.each(["en", "ru"] as const)("renders final navigation, passive Tools and safe Settings in %s", async (language) => {
    setLanguage(language); mocks.requestUrl.mockClear(); const f = overviewFixture(); await f.view.onOpen();
    expect(f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("nav-")).map((e) => e.attrs["data-health-action"]))
      .toEqual(["nav-health", "nav-findings", "nav-discover", "nav-recall", "nav-connect", "nav-tools", "nav-settings"]);
    for (const page of ["tools", "settings"] as const) {
      f.content.action(`nav-${page}`).click(); passive(f);
      expect(f.content.action(`nav-${page}`).attrs["aria-current"]).toBe("page");
      expect(f.content.ownerDocument.activeElement?.attrs["data-health-heading"]).toBe("true");
      expect(f.content.texts()).not.toMatch(/@(?:tools|settings|deep|semantic|connect)|PRIVATE_ENDPOINT|AI Hub|Vault Audit AI/u);
      expect(f.content.all().filter((e) => e.attrs["data-health-action"]).every((e) => e.tag === "button")).toBe(true);
    }
    expect(f.content.texts()).toContain("deep-fixture"); expect(f.content.texts()).toContain("semantic-fixture"); expect(f.content.texts()).toContain("42");
    expect(f.content.texts()).toContain(language === "en" ? "Configured" : "Настроено");
    expect(f.content.texts()).toContain(language === "en" ? "Local scheduling" : "Локальное планирование");
    expect(f.content.texts()).toContain(language === "en" ? "Settings → Community plugins → Veynrel" : "настройки Obsidian → Сторонние плагины → Veynrel");
    expect(f.content.all().some((e) => e.tag === "input")).toBe(false);
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("each Tools action invokes one host operation and editor entries never guess an editor", async () => {
    const f = overviewFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen(); f.content.action("tools").click();
    expect(f.content.texts()).toContain("command palette"); expect(f.content.texts()).toContain("Single Audit");
    expect(f.content.texts()).toContain("Knowledge Health"); expect(f.content.texts()).toContain("backups");
    const actions = f.content.all().filter((e) => e.attrs["data-health-action"]?.startsWith("tool-"));
    expect(actions).toHaveLength(5);
    for (const [name, operation] of Object.entries(f.tools)) {
      f.content.action(`tool-${name}`).click(); await flush(); expect(operation).toHaveBeenCalledTimes(1);
    }
    for (const operation of Object.values(f.tools)) expect(operation).toHaveBeenCalledTimes(1);
    passive(f); expect(f.controller.listFindings()).toEqual([]);
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("Settings reuses the existing setup choosers and Connect route without setup or IO on entry", async () => {
    const f = overviewFixture(); mocks.requestUrl.mockClear(); await f.view.onOpen();
    for (const kind of ["deep", "semantic", "connect"] as const) {
      f.content.action("nav-settings").click(); f.content.action(`settings-${kind}`).click();
      expect(f.content.action(kind === "deep" ? "deep-provider-ollama" : kind === "semantic" ? "semantic-mode-local" : "connect-check")).toBeDefined();
      expect(f.content.action(`nav-${kind === "connect" ? "connect" : "health"}`).attrs["aria-current"]).toBe("page");
      passive(f);
    }
    await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it("two views keep independent routes and share launchers; late errors cannot resurrect a route", async () => {
    const f = overviewFixture(); await f.view.onOpen();
    const second = new VeynrelHealthView({ app: f.app } as never, f.controller, f.tools, f.semantic, f.recall, f.deep, undefined, f.connect);
    await second.onOpen(); const content = second.contentEl as unknown as InstanceType<typeof mocks.Element>;
    f.content.action("nav-tools").click(); content.action("nav-settings").click();
    let fail!: (error: Error) => void; f.tools.generateMocs.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    const stale = f.content.action("tool-generateMocs"); stale.click(); f.content.action("nav-settings").click(); stale.click();
    expect(f.tools.generateMocs).toHaveBeenCalledTimes(1);
    fail(new Error("PRIVATE_PROVIDER_BODY")); await flush();
    expect(f.content.action("nav-settings").attrs["aria-current"]).toBe("page"); expect(f.content.texts()).not.toContain("PRIVATE_PROVIDER_BODY");
    content.action("nav-tools").click(); f.tools.openAskVault.mockImplementationOnce(() => { throw new Error("PRIVATE_PROVIDER_BODY"); });
    content.action("tool-openAskVault").click(); await flush();
    expect(content.texts()).toContain("Could not open this tool"); expect(content.texts()).not.toContain("PRIVATE_PROVIDER_BODY");
    content.action("tool-openAskVault").click(); await flush();
    expect(f.tools.openAskVault).toHaveBeenCalledTimes(2); expect(content.texts()).not.toContain("Could not open this tool");
    await second.onClose(); await f.view.onClose(); f.recall.dispose(); f.controller.dispose();
  });
  it.each(["onboarding", "findings.json", "scan-runs.json"])("%s hides Tools/Settings and rejects stale launch actions", async (boundary) => {
    const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-tools").click();
    const stale = f.content.action("tool-openBatchProcessing"); await f.view.onClose();
    if (boundary === "onboarding") await f.preferences.update({ onboardingCompleted: false, profileChosen: false });
    else f.files.set(`${root}/${boundary}`, "invalid");
    // A fresh controller models recovery discovered on reopen.
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const view = new VeynrelHealthView({ app: f.app } as never, controller, f.tools); await view.onOpen();
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.action("nav-tools")).toBeUndefined(); expect(content.action("nav-settings")).toBeUndefined(); expect(content.action("tools")).toBeUndefined();
    stale.click(); expect(f.tools.openBatchProcessing).not.toHaveBeenCalled();
    await view.onClose(); controller.dispose(); f.controller.dispose(); f.recall.dispose();
  });
  it("onboarding taking over a mounted Tools view invalidates actions and cannot resurrect its route", async () => {
    const f = overviewFixture(); await f.view.onOpen(); f.content.action("nav-tools").click();
    const stale = f.content.action("tool-openAskVault");
    await f.controller.updatePreferences({ onboardingCompleted: false, profileChosen: false });
    stale.click(); expect(f.tools.openAskVault).not.toHaveBeenCalled(); expect(f.content.action("nav-tools")).toBeUndefined();
    await f.controller.updatePreferences({ onboardingCompleted: true, profileChosen: true });
    expect(f.content.action("nav-health").attrs["aria-current"]).toBe("page");
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
    await f.view.onOpen();
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
    f.content.action("change-profile").click();
    expect(f.content.ownerDocument.activeElement?.attrs["data-health-action"]).toBe("area-structure");
    const readCount = f.adapter.read.mock.calls.length;
    await f.view.onClose(); await f.view.onOpen();
    expect(f.adapter.read).toHaveBeenCalledTimes(readCount);
    for (const effect of [f.vault.getMarkdownFiles, f.vault.read, f.adapter.write, f.save, mocks.requestUrl, localScan, deepScan, semanticScan]) expect(effect).not.toHaveBeenCalled();
    // The existing metadata initialization entry is retained; it has no inventory capability.
    expect(recallInit).toHaveBeenCalled();
    await f.view.onClose();
  });
  it.each(["structure", "connections", "knowledge"])("area %s opens the existing Findings filter", async (id) => {
    const f = fixture(); await f.view.onOpen();
    expect(f.content.action(`area-${id}`).tag).toBe("button"); f.content.action(`area-${id}`).click();
    expect(f.content.action(`filter-${id}`).attrs["aria-pressed"]).toBe("true");
    expect(f.content.ownerDocument.activeElement?.attrs["data-health-heading"]).toBe("true");
  });
  it("blocking recovery and onboarding render no pulse or charts; history degradation keeps real current counts", async () => {
    const onboarding = fixture({ profileChosen: false, onboardingCompleted: false }); await onboarding.view.onOpen();
    expect(onboarding.content.all().some((e) => e.attrs["data-pulse-state"])).toBe(false);
    const broken = fixture(); broken.files.set(`${root}/findings.json`, "{broken"); await broken.view.onOpen();
    expect(broken.content.action("recover")).toBeDefined(); expect(broken.content.all().some((e) => e.attrs["data-area"])).toBe(false);
    const history = fixture(); history.files.set(`${root}/scan-runs.json`, "{broken"); await history.view.onOpen();
    expect(history.content.action("recover")).toBeDefined();
    expect(history.content.all().find((e) => e.attrs["data-pulse-state"])?.attrs["data-pulse-state"]).toBe("unknown");
    expect(history.content.texts()).toContain("Coverage not established");
  });
});
