import { relationshipWireFixture, relationshipFixtureUser } from "../tests/relationshipWireFixture";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { callOpenRouter } from "../api";
import { setLanguage } from "../i18n";
import { requestUrl } from "obsidian";
import type { LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import type { RefinedSearchUpdate } from "../rerank/types";
import plannerFixture from "../tests/fixtures/change-planner.json";
import relationshipCases from "../tests/fixtures/relationships.json";

const mocks = vi.hoisted(() => {
  interface FakeEvent {
    key?: string;
    preventDefault?: () => void;
  }

  class FakeElement {
    closest() { return null; }
    scrollIntoView() {}
    hidden = false;
    parentElement?: FakeElement;
    prepend(child: FakeElement) {
      const previous = child.parentElement?.children;
      if (previous) previous.splice(previous.indexOf(child), 1);
      child.parentElement = this; this.children.unshift(child);
    }
    readonly children: FakeElement[] = [];
    readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
    tag = "div";
    cls = "";
    text = "";
    value = "";
    disabled = false;
    checked = false;
    focused = false;
    attributes = new Map<string, string>();

    createDiv(options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
      return this.create("div", options);
    }

    createSpan(options: { cls?: string; text?: string } = {}) {
      return this.create("span", options);
    }

    createEl(
      tag: string,
      options: {
        cls?: string;
        text?: string;
        type?: string;
        attr?: Record<string, string>;
      } = {},
    ) {
      return this.create(tag, options);
    }

    private create(
      tag: string,
      options: {
        cls?: string;
        text?: string;
        type?: string;
        attr?: Record<string, string>;
      },
    ) {
      const child = new FakeElement();
      child.tag = tag;
      child.cls = options.cls ?? "";
      child.text = options.text ?? "";
      if (options.type) child.attributes.set("type", options.type);
      for (const [key, value] of Object.entries(options.attr ?? {})) {
        child.attributes.set(key, value);
      }
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    addClass(value: string) {
      this.cls = `${this.cls} ${value}`.trim();
    }

    contains(element: FakeElement): boolean {
      return this === element || this.children.some(child => child.contains(element));
    }

    empty() {
      this.children.length = 0;
      this.text = "";
    }

    setText(value: string) {
      this.text = value;
    }

    setAttribute(key: string, value: string) {
      this.attributes.set(key, value);
    }

    addEventListener(type: string, listener: (event: FakeEvent) => void) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    trigger(type: string, event: FakeEvent = {}) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({
          key: event.key,
          preventDefault: vi.fn(),
        });
      }
    }

    querySelector(selector?: string): FakeElement | null {
      if (selector?.startsWith(".")) return this.findByClass(selector.slice(1))[0] ?? null;
      const walk = (e: FakeElement): FakeElement[] => [e, ...e.children.flatMap(walk)];
      return walk(this).find(e => ["alert", "status"].includes(e.attributes.get("role") ?? "") || e.tag === "h3") ?? null;
    }

    focus() {
      this.focused = true;
    }

    findByClass(value: string): FakeElement[] {
      const matches = this.cls.split(/\s+/).includes(value) ? [this] : [];
      return [
        ...matches,
        ...this.children.flatMap((child) => child.findByClass(value)),
      ];
    }

    findByTag(value: string): FakeElement[] {
      const matches = this.tag === value ? [this] : [];
      return [
        ...matches,
        ...this.children.flatMap((child) => child.findByTag(value)),
      ];
    }
  }

  class TFile {
    path = "";
  }
  class MarkdownView {
    editor = {
      setCursor: vi.fn(),
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    };
  }
  class Notice {
    static messages: string[] = [];
    constructor(message: string) {
      Notice.messages.push(message);
    }
  }
  class Modal {
    app: unknown;
    modalEl = new FakeElement();
    titleEl = new FakeElement();
    contentEl = new FakeElement();
    closed = false;
    constructor(app: unknown) {
      this.app = app;
    }
    onOpen() {}
    onClose() {}
    open() {
      this.onOpen();
    }
    close() {
      this.closed = true;
      this.onClose();
    }
  }
  return { FakeElement, TFile, MarkdownView, Notice, Modal };
});

vi.mock("obsidian", () => ({
  App: class {},
  MarkdownView: mocks.MarkdownView,
  Modal: mocks.Modal,
  Notice: mocks.Notice,
  TFile: mocks.TFile,
  getLanguage: () => "ru",
  requestUrl: vi.fn(),
  parseFrontMatterTags: () => null,
  parseLinktext: (link: string) => ({ path: link.split("#")[0] }),
}));

import {
  formatSemanticScore,
  SemanticSearchModal,
  semanticBasename,
  semanticBreadcrumb,
} from "./semanticSearchModal";
import {
  SemanticDuplicatesModal,
  SemanticSimilarNotesModal,
} from "./semanticDiscoveryModal";
import { SemanticSourceNotIndexedError } from "./errors";
import type {
  SemanticDocumentResult,
  SemanticDocumentSimilarity,
  SemanticDuplicatePair,
} from "./types";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function result(preview?: string): SemanticDocumentResult {
  return {
    path: "Folder/Alpha.md",
    score: 0.8421,
    matches: [
      {
        id: "alpha:0",
        path: "Folder/Alpha.md",
        headingPath: ["Alpha", "Section"],
        ordinal: 0,
        contentHash: "hash-alpha",
        preview,
        source: {
          startOffset: 0,
          endOffset: 1,
          startLine: 4,
          endLine: 4,
        },
        score: 0.8421,
      },
    ],
  };
}

function harness(results = [result("safe preview")]) {
  const file = new mocks.TFile();
  file.path = "Folder/Alpha.md";
  const getFileByPath = vi.fn<
    (path: string) => InstanceType<typeof mocks.TFile> | null
  >(() => file);
  const view = new mocks.MarkdownView();
  const leaf = {
    view,
    openFile: vi.fn(async () => undefined),
  };
  const app = {
    vault: { getFileByPath },
    workspace: { getLeaf: vi.fn(() => leaf) },
  };
  const delegate = {
    prepareSearch: vi.fn(async () => ({
      initialized: true,
      indexing: false,
      vectorCount: 1,
      vectorGeneration: 1,
      dimensions: 3,
      embeddingSpaceId: "space",
    })),
    search: vi.fn(async () => results),
    errorMessage: vi.fn((_error: unknown) => "safe error"),
  };
  const modal = new SemanticSearchModal(app as never, delegate);
  modal.open();
  const content = modal.contentEl as unknown as InstanceType<
    typeof mocks.FakeElement
  >;
  return { modal, content, delegate, app, leaf, view };
}

describe("manual refinement controls", () => {
  function manual(configured = true, count = 10) {
    const f = harness();
    const original = Array.from({ length: count }, (_, index) => ({ ...result(`preview-${index}`), path: `note-${index}.md` }));
    let publish!: (update: RefinedSearchUpdate) => void;
    let signal!: AbortSignal;
    const refine = vi.fn(async (): Promise<RefinedSearchUpdate> => {
      publish({ stage: "refining", results: original });
      return { stage: "reranked", results: [...original].reverse().map(item => ({ ...item, rerankScore: 8 })), evaluated: 28, candidates: 30 };
    });
    const discover = vi.fn(async (_query: string, callback: typeof publish, cancellation: AbortSignal) => {
      publish = callback; signal = cancellation;
      return { stage: "semantic", results: original, session: { id: 1, configured, refine } };
    });
    Object.assign(f.delegate, { searchDiscover: discover });
    const input = f.content.findByTag("input")[0];
    const search = async () => { input.value = "query"; input.trigger("keydown", { key: "Enter" }); await flush(); };
    const action = (name = "refine") => f.content.findByTag("button").find(button => button.attributes.get("data-rerank-action") === name)!;
    return { ...f, original, refine, discover, input, search, action, signal: () => signal,
      publish: (update: RefinedSearchUpdate) => publish(update) };
  }

  it("searches freely, refines only on click and switches both orders locally with original scores", async () => {
    const f = manual();
    await f.search(); await f.search();
    expect(f.refine).not.toHaveBeenCalled(); expect(f.discover).toHaveBeenCalledTimes(2);
    expect(f.content.findByClass("ai-semantic-result-card")).toHaveLength(10);
    expect(f.action().text).toBe("Уточнить результаты");
    f.action().trigger("click"); await flush();
    expect(f.refine).toHaveBeenCalledOnce(); expect(f.discover).toHaveBeenCalledTimes(2);
    expect(f.content.findByClass("ai-semantic-result-title")[0].text).toBe("note-9");
    expect(f.content.findByClass("ai-semantic-result-score")[0].text).toBe("0.842");
    expect(f.content.findByClass("ai-semantic-search-status")[0].text).toContain("28 из 30");
    f.action("original").trigger("click");
    expect(f.action("original").attributes.get("aria-pressed")).toBe("true");
    expect(f.content.findByClass("ai-semantic-result-title")[0].text).toBe("note-0");
    f.action("refined").trigger("click");
    expect(f.content.findByClass("ai-semantic-result-title")[0].text).toBe("note-9");
    expect(f.refine).toHaveBeenCalledOnce(); expect(f.delegate.search).not.toHaveBeenCalled();
  });

  it.each(["edit", "search", "close", "source-or-settings"])("rejects double clicks and ignores late manual replies after %s", async change => {
    const f = manual(); let finish!: (update: RefinedSearchUpdate) => void;
    f.refine.mockImplementation(() => {
      f.publish({ stage: "refining", results: f.original });
      return new Promise(resolve => { finish = resolve; });
    });
    await f.search(); const previous = f.signal();
    const button = f.action(); button.trigger("click"); button.trigger("click"); await flush();
    expect(f.refine).toHaveBeenCalledOnce(); expect(button.disabled).toBe(true);
    expect(f.input.disabled).toBe(false); expect(f.content.findByClass("ai-semantic-result-card")).toHaveLength(10);
    if (change === "edit") { f.input.value = "draft"; f.input.trigger("input"); }
    if (change === "search") await f.search();
    if (change === "close") f.modal.close();
    if (change === "source-or-settings") f.publish({ stage: "skipped", reason: "obsolete", results: f.original });
    if (change !== "source-or-settings") expect(previous.aborted).toBe(true);
    if (change !== "search") expect(f.action()).toBeUndefined();
    finish({ stage: "reranked", results: [result("LATE REPLY")] }); await flush();
    expect(f.content.findByClass("ai-semantic-result-preview").some(item => item.text === "LATE REPLY")).toBe(false);
  });

  it("invalidates the button on edits even after a completed search", async () => {
    const f = manual(); await f.search();
    f.input.value = "different"; f.input.trigger("input");
    expect(f.action()).toBeUndefined(); expect(f.signal().aborted).toBe(true);
    expect(f.content.findByClass("ai-semantic-search-status")[0].text).toBe("Результаты устарели. Выполните поиск заново.");
    expect(f.refine).not.toHaveBeenCalled();
  });

  it("keeps originals on failure, discloses a paid retry and retries only on another click", async () => {
    const f = manual(); f.refine.mockResolvedValueOnce({ stage: "fallback", results: f.original });
    await f.search(); f.action().trigger("click"); await flush();
    expect(f.content.findByClass("ai-semantic-result-title")[0].text).toBe("note-0");
    expect(f.content.findByTag("p").some(item => item.text.includes("тоже может оплачиваться"))).toBe(true);
    expect(f.refine).toHaveBeenCalledOnce(); expect(f.action().disabled).toBe(false);
    f.action().trigger("click"); await flush(); expect(f.refine).toHaveBeenCalledTimes(2);
  });

  it("shows the settings path instead of an unusable action, and blocks fewer than two candidates", async () => {
    const missing = manual(false); await missing.search();
    expect(missing.action()).toBeUndefined();
    expect(missing.content.findByTag("p").some(item => item.text.includes("Настройки → Veynrel"))).toBe(true);
    const single = manual(true, 1); await single.search(); single.action().trigger("click");
    expect(single.action().disabled).toBe(true); expect(single.refine).not.toHaveBeenCalled();
  });
});

describe("SemanticSearchModal helpers and behavior", () => {
  it("navigates to the current selected rerank fragment while retaining all original previews", async () => {
    const f = harness(); const document = result("original preview");
    const selected = { ...document.matches[0], id: "selected-current-chunk", source: {
      startOffset: 300, endOffset: 400, startLine: 42, endLine: 45,
    } };
    Object.assign(f.delegate, { searchDiscover: async () => ({ stage: "reranked", evaluated: 2, candidates: 2,
      results: [{ ...document, rerankScore: 8, rerankMatch: selected }] }) });
    f.content.findByTag("input")[0].value = "query";
    f.content.findByTag("button")[0].trigger("click"); await flush();
    expect(f.content.findByClass("ai-semantic-result-preview")[0].text).toBe("original preview");
    f.content.findByClass("ai-semantic-result-card")[0].trigger("click"); await flush();
    expect(f.view.editor.setCursor).toHaveBeenCalledWith({ line: 42, ch: 0 });
  });
  it("shows original results while refining and supports a newer explicit search", async () => {
    const f = harness();
    let finish!: (update: RefinedSearchUpdate) => void;
    let firstSignal!: AbortSignal;
    const discover = vi.fn(async (_query: string, publish: (update: RefinedSearchUpdate) => void, signal: AbortSignal) => {
      firstSignal = signal;
      publish({ stage: "refining", results: [result("original")] });
      return new Promise<RefinedSearchUpdate>(resolve => { finish = resolve; });
    });
    Object.assign(f.delegate, { searchDiscover: discover });
    const input = f.content.findByTag("input")[0], button = f.content.findByTag("button")[0];
    input.value = "first"; button.trigger("click"); await flush();
    expect(f.content.findByClass("ai-semantic-result-preview")[0].text).toBe("original");
    expect(f.content.findByClass("ai-semantic-search-status")[0].attributes.get("data-state")).toBe("refining");
    expect(input.disabled).toBe(false);
    discover.mockImplementationOnce(async () => ({ stage: "reranked", results: [result("new result")], evaluated: 2, candidates: 2 }));
    input.value = "second"; button.trigger("click"); await flush();
    expect(firstSignal.aborted).toBe(true);
    finish({ stage: "reranked", results: [result("late old result")], evaluated: 2, candidates: 2 }); await flush();
    expect(f.content.findByClass("ai-semantic-result-preview")[0].text).toBe("new result");
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it.each(["close", "edit", "unload"])("ignores refinement after %s and never sends on input events", async action => {
    const f = harness(); let finish!: (value: RefinedSearchUpdate) => void; let signal!: AbortSignal;
    const discover = vi.fn(async (_query: string, publish: (update: RefinedSearchUpdate) => void, currentSignal: AbortSignal) => {
      signal = currentSignal; publish({ stage: "refining", results: [result("original")] });
      return new Promise<RefinedSearchUpdate>(resolve => { finish = resolve; });
    });
    Object.assign(f.delegate, { searchDiscover: discover });
    const input = f.content.findByTag("input")[0];
    input.value = "typed"; input.trigger("input"); expect(discover).not.toHaveBeenCalled();
    f.content.findByTag("button")[0].trigger("click"); await flush();
    if (action === "close") f.modal.close();
    else if (action === "edit") { input.value = "new draft"; input.trigger("input"); }
    else Object.assign(f.delegate, { isSearchAvailable: () => false });
    if (action !== "unload") expect(signal.aborted).toBe(true);
    finish({ stage: "reranked", results: [result("late reply")] }); await flush();
    expect(f.content.findByClass("ai-semantic-result-preview").some(item => item.text === "late reply")).toBe(false);
    expect(discover).toHaveBeenCalledOnce();
  });

  it.each(["fallback", "reranked", "skipped"] as const)("renders %s status as text and preserves note navigation", async stage => {
    const f = harness();
    const update: RefinedSearchUpdate = { stage, results: [result("<b>local fragment</b>")],
      evaluated: 2, candidates: 3, reason: stage === "skipped" ? "insufficient" : undefined };
    const discover = vi.fn(async () => update);
    Object.assign(f.delegate, { searchDiscover: discover });
    f.content.findByTag("input")[0].value = "search";
    f.content.findByTag("button")[0].trigger("click"); await flush();
    const status = f.content.findByClass("ai-semantic-search-status")[0];
    expect(status.attributes.get("data-state")).toBe(stage);
    if (stage === "fallback") expect(status.text).toBe("Не удалось уточнить результаты. Показана исходная выдача.");
    if (stage === "reranked") expect(status.text).toContain("2 из 3");
    expect(f.content.findByClass("ai-semantic-result-preview")[0].text).toBe("<b>local fragment</b>");
    expect(f.content.findByClass("ai-semantic-result-score")[0].text).toBe("0.842");
    f.content.findByClass("ai-semantic-result-card")[0].trigger("click"); await flush();
    expect(f.leaf.openFile).toHaveBeenCalledOnce(); expect(f.view.editor.setCursor).toHaveBeenCalled();
    expect(discover).toHaveBeenCalledOnce();
  });
  it("formats scores, basenames, and breadcrumbs", () => {
    expect(formatSemanticScore(0.8421)).toBe("0.842");
    expect(semanticBasename("Folder/Alpha.md")).toBe("Alpha");
    expect(semanticBreadcrumb(["One", "", "Two"])).toBe("One › Two");
  });

  it("focuses the input and does not search an empty query", async () => {
    const { content, delegate } = harness();
    const input = content.findByTag("input")[0];
    expect(input.focused).toBe(true);
    content.findByTag("button")[0].trigger("click");
    await flush();
    expect(delegate.prepareSearch).not.toHaveBeenCalled();
    expect(content.findByClass("ai-semantic-search-status")[0].text).toBe(
      "Введите непустой запрос.",
    );
  });

  it("runs on Enter and renders preview as text", async () => {
    const { content, delegate } = harness();
    const input = content.findByTag("input")[0];
    input.value = "meaning";
    input.trigger("keydown", { key: "Enter" });
    await flush();
    expect(delegate.search).toHaveBeenCalledWith("meaning");
    expect(
      content.findByClass("ai-semantic-result-preview")[0].text,
    ).toBe("safe preview");
  });

  it("handles an empty preview without creating a preview element", async () => {
    const { content } = harness([result(undefined)]);
    const input = content.findByTag("input")[0];
    input.value = "meaning";
    content.findByTag("button")[0].trigger("click");
    await flush();
    expect(content.findByClass("ai-semantic-result-preview")).toEqual([]);
  });

  it("prevents parallel searches while busy", async () => {
    let release: () => void = () => {};
    const { content, delegate } = harness();
    delegate.prepareSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              initialized: true,
              indexing: false,
              vectorCount: 1,
              vectorGeneration: 1,
              dimensions: 3,
              embeddingSpaceId: "space",
            });
        }),
    );
    const input = content.findByTag("input")[0];
    const button = content.findByTag("button")[0];
    input.value = "meaning";
    button.trigger("click");
    button.trigger("click");
    expect(delegate.prepareSearch).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    release();
    await flush();
  });

  it("shows the empty-index message without calling the query search", async () => {
    const { content, delegate } = harness();
    delegate.errorMessage.mockImplementation(
      (error) => (error as Error).message,
    );
    delegate.prepareSearch.mockResolvedValue({
      initialized: false,
      indexing: false,
      vectorCount: 0,
      vectorGeneration: 0,
      dimensions: 0,
      embeddingSpaceId: "",
    });
    const input = content.findByTag("input")[0];
    input.value = "must not be embedded";
    content.findByTag("button")[0].trigger("click");
    await flush();
    expect(delegate.prepareSearch).toHaveBeenCalledOnce();
    expect(delegate.search).not.toHaveBeenCalled();
    expect(content.findByClass("ai-semantic-search-status")[0].text).toBe(
      "Семантический индекс пуст. Сначала обновите индекс Vault.",
    );
  });

  it("ignores a stale response after close", async () => {
    let release: () => void = () => {};
    const { modal, content, delegate } = harness();
    delegate.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([result("late")]);
        }),
    );
    const input = content.findByTag("input")[0];
    input.value = "meaning";
    content.findByTag("button")[0].trigger("click");
    await Promise.resolve();
    modal.close();
    release();
    await flush();
    expect(content.children).toEqual([]);
  });

  it("opens the exact file, moves the cursor, then closes", async () => {
    const { modal, content, leaf, view } = harness();
    const input = content.findByTag("input")[0];
    input.value = "meaning";
    content.findByTag("button")[0].trigger("click");
    await flush();
    content.findByClass("ai-semantic-result-card")[0].trigger("click");
    await flush();
    expect(leaf.openFile).toHaveBeenCalledOnce();
    expect(view.editor.setCursor).toHaveBeenCalledWith({ line: 4, ch: 0 });
    expect((modal as unknown as { closed: boolean }).closed).toBe(true);
  });

  it("keeps the modal open when the exact file is missing", async () => {
    mocks.Notice.messages = [];
    const { modal, content, app } = harness();
    app.vault.getFileByPath.mockReturnValue(null);
    const input = content.findByTag("input")[0];
    input.value = "meaning";
    content.findByTag("button")[0].trigger("click");
    await flush();
    content.findByClass("ai-semantic-result-card")[0].trigger("click");
    await flush();
    expect(mocks.Notice.messages).toContain(
      "Заметка больше не существует.",
    );
    expect((modal as unknown as { closed: boolean }).closed).toBe(false);
  });

  it("never assigns user strings through innerHTML", () => {
    const source = readFileSync(
      new URL("./semanticSearchModal.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("innerHTML");
    expect(source).not.toContain("insertAdjacentHTML");
  });
});

function discoveryMatch(path: string, line: number) {
  return {
    id: `${path}:0`,
    path,
    headingPath: [path.replace(/\.md$/u, ""), "Relevant"],
    ordinal: 0,
    contentHash: `hash-${path}`,
    preview: `safe preview for ${path}`,
    source: {
      startOffset: 0,
      endOffset: 20,
      startLine: line,
      endLine: line,
    },
    score: 0.97,
  };
}

function discoveryHarness() {
  const similar: SemanticDocumentSimilarity[] = [
    {
      path: "Folder/Near.md",
      score: 0.975,
      matches: [discoveryMatch("Folder/Near.md", 12)],
    },
  ];
  const pairs: SemanticDuplicatePair[] = [
    {
      leftPath: "A.md",
      rightPath: "Folder/B.md",
      score: 0.981,
      leftMatches: [discoveryMatch("A.md", 3)],
      rightMatches: [discoveryMatch("Folder/B.md", 18)],
    },
  ];
  const files = new Map<string, InstanceType<typeof mocks.TFile>>();
  for (const path of ["Folder/Near.md", "A.md", "Folder/B.md"]) {
    const file = new mocks.TFile();
    file.path = path;
    files.set(path, file);
  }
  const view = new mocks.MarkdownView();
  const leaf = {
    view,
    openFile: vi.fn(async () => undefined),
  };
  const app = {
    vault: {
      getFileByPath: vi.fn((path: string) => files.get(path) ?? null),
    },
    workspace: { getLeaf: vi.fn(() => leaf) },
  };
  const delegate = {
    findSimilarNotes: vi.fn(async () => similar),
    findPotentialDuplicates: vi.fn(async () => pairs),
    errorMessage: vi.fn((_error: unknown) => "safe discovery error"),
  };
  return { app, delegate, leaf, view };
}

describe("semantic discovery modals", () => {
  it("loads Similar Notes automatically and renders text-only evidence", async () => {
    const { app, delegate } = discoveryHarness();
    const modal = new SemanticSimilarNotesModal(
      app as never,
      delegate,
      "Source.md",
    );
    modal.open();
    await flush();
    const content = modal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    expect(delegate.findSimilarNotes).toHaveBeenCalledWith("Source.md");
    expect(content.findByClass("ai-semantic-result-title")[0].text).toBe(
      "Near",
    );
    expect(content.findByClass("ai-semantic-result-preview")[0].text).toBe(
      "safe preview for Folder/Near.md",
    );
    expect(content.findByClass("ai-semantic-result-score")[0].text).toBe(
      "0.975",
    );
  });

  it("opens the exact Similar Notes path at the best chunk line", async () => {
    const { app, delegate, leaf, view } = discoveryHarness();
    const modal = new SemanticSimilarNotesModal(
      app as never,
      delegate,
      "Source.md",
    );
    modal.open();
    await flush();
    const content = modal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    content.findByClass("ai-semantic-result-card")[0].trigger("click");
    await flush();
    expect(app.vault.getFileByPath).toHaveBeenCalledWith("Folder/Near.md");
    expect(leaf.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Folder/Near.md" }),
    );
    expect(view.editor.setCursor).toHaveBeenCalledWith({ line: 12, ch: 0 });
    expect((modal as unknown as { closed: boolean }).closed).toBe(true);
  });

  it("renders one canonical potential-duplicate pair with two open targets", async () => {
    const { app, delegate, leaf, view } = discoveryHarness();
    const modal = new SemanticDuplicatesModal(app as never, delegate);
    modal.open();
    await flush();
    const content = modal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    expect(delegate.findPotentialDuplicates).toHaveBeenCalledOnce();
    expect(content.findByClass("ai-semantic-duplicate-card")).toHaveLength(1);
    expect(content.findByClass("ai-semantic-duplicate-note")).toHaveLength(2);
    expect(content.findByClass("ai-semantic-duplicate-label")[0].text).toBe(
      "Потенциально похожая пара",
    );
    content.findByClass("ai-semantic-duplicate-note")[1].findByClass("ai-semantic-result-title")[0].trigger("keydown", {
      key: "Enter",
    });
    await flush();
    expect(leaf.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Folder/B.md" }),
    );
    expect(view.editor.setCursor).toHaveBeenCalledWith({ line: 18, ch: 0 });
  });

  it("preserves complete long excerpts behind a disclosure separate from note navigation", async () => {
    const f = discoveryHarness(), pair = (await f.delegate.findPotentialDuplicates())[0];
    const preview = "Long synthetic excerpt. ".repeat(80);
    pair.leftMatches[0].preview = preview;
    f.delegate.findPotentialDuplicates.mockResolvedValue([pair]);
    const modal = new SemanticDuplicatesModal(f.app as never, f.delegate); modal.open(); await flush();
    const content = modal.contentEl as unknown as InstanceType<typeof mocks.FakeElement>;
    const note = content.findByClass("ai-semantic-duplicate-note")[0];
    expect(note.attributes.has("role")).toBe(false);
    expect(note.findByTag("details")[0].attributes.has("open")).toBe(false);
    expect(note.findByClass("ai-semantic-result-preview")[0].text).toBe(preview);
    note.findByTag("summary")[0].trigger("click"); await flush();
    expect(f.leaf.openFile).not.toHaveBeenCalled();
  });

  it("shows controlled empty and error states", async () => {
    const empty = discoveryHarness();
    empty.delegate.findSimilarNotes.mockResolvedValue([]);
    const similarModal = new SemanticSimilarNotesModal(
      empty.app as never,
      empty.delegate,
      "Source.md",
    );
    similarModal.open();
    await flush();
    const similarContent = similarModal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    expect(
      similarContent.findByClass("ai-semantic-search-status")[0].text,
    ).toBe("Похожие заметки не найдены.");

    const failed = discoveryHarness();
    failed.delegate.findPotentialDuplicates.mockRejectedValue(
      new Error("private details"),
    );
    const duplicateModal = new SemanticDuplicatesModal(
      failed.app as never,
      failed.delegate,
    );
    duplicateModal.open();
    await flush();
    const duplicateContent =
      duplicateModal.contentEl as unknown as InstanceType<
        typeof mocks.FakeElement
      >;
    expect(
      duplicateContent.findByClass("ai-semantic-search-status")[0].text,
    ).toBe("safe discovery error");
    expect(duplicateContent.text).not.toContain("private details");
  });

  it("renders a source-not-indexed rejection as a controlled localized state", async () => {
    const { app, delegate } = discoveryHarness();
    const notIndexed = new SemanticSourceNotIndexedError();
    delegate.findSimilarNotes.mockRejectedValue(notIndexed);
    delegate.errorMessage.mockImplementation((error: unknown) =>
      error instanceof SemanticSourceNotIndexedError
        ? "Текущая заметка отсутствует в семантическом индексе."
        : "unexpected error",
    );
    const modal = new SemanticSimilarNotesModal(
      app as never,
      delegate,
      "Source.md",
    );
    modal.open();
    await flush();
    const content = modal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    const status = content.findByClass("ai-semantic-search-status")[0];
    expect(delegate.errorMessage).toHaveBeenCalledWith(notIndexed);
    expect(status.text).toBe(
      "Текущая заметка отсутствует в семантическом индексе.",
    );
    expect(status.attributes.get("data-state")).toBe("error");
    expect(status.text).not.toContain(notIndexed.message);
  });

  it("ignores stale discovery results after close", async () => {
    let release: () => void = () => {};
    const { app, delegate } = discoveryHarness();
    delegate.findSimilarNotes.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );
    const modal = new SemanticSimilarNotesModal(
      app as never,
      delegate,
      "Source.md",
    );
    modal.open();
    const content = modal.contentEl as unknown as InstanceType<
      typeof mocks.FakeElement
    >;
    modal.close();
    release();
    await flush();
    expect(content.children).toEqual([]);
  });

  it("never assigns note content through HTML APIs", () => {
    const source = readFileSync(
      new URL("./semanticDiscoveryModal.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("innerHTML");
    expect(source).not.toContain("insertAdjacentHTML");
  });
});

describe("manual Decisions UI", () => {
  it("offers an explicit pair action without running the model on the duplicates list", async () => {
    const f = discoveryHarness(); const assessOverlap = vi.fn();
    const modal = new SemanticDuplicatesModal(f.app as never, { ...f.delegate, assessOverlap });
    modal.open(); await flush(); const content = modal.contentEl as unknown as InstanceType<typeof mocks.FakeElement>;
    expect(assessOverlap).not.toHaveBeenCalled();
    const button = content.findByTag("button")[0]; expect(button.text).toBe("Оценить пересечение");
    button.trigger("click"); expect(assessOverlap).toHaveBeenCalledWith(expect.objectContaining({ leftPath: "A.md", rightPath: "Folder/B.md" }));
    modal.close();
  });
  it.each(["en", "ru"] as const)("shows exact bounded text, manual state transitions and stale result in %s", async language => {
    const { setLanguage } = await import("../i18n"); setLanguage(language);
    const { OverlapModal } = await import("../decisions/overlapModal");
    const { OverlapSession } = await import("../decisions/overlapSession");
    const { DEFAULT_DECISIONS_SETTINGS } = await import("../decisions/types");
    const { validateDecisionsResponse } = await import("../decisions/openRouterDecisions");
    const f = discoveryHarness(); const preview = {
      a: { match: discoveryMatch("A.md", 3), text: "<script>untrusted literal</script>" + "😀".repeat(3900), truncated: true, sourceHash: "a" },
      b: { match: discoveryMatch("Folder/B.md", 18), text: "second fragment", truncated: false, sourceHash: "b" },
    };
    const answer = validateDecisionsResponse({ answers: { overlap: { type: "choice", choice: "same_information", confidence: 0.375,
      probabilities: { same_information: 0.5, partial_overlap: 0.5, related_distinct: 0, unrelated: 0, insufficient_context: 0 } } } }, "typesafe/jev-1.13");
    let finish!: () => void;
    const assess = vi.fn(() => new Promise<typeof answer>(resolve => { finish = () => resolve(answer); }));
    const release = vi.fn();
    const session = new OverlapSession(["A.md", "Folder/B.md"], {
      settings: () => ({ ...DEFAULT_DECISIONS_SETTINGS, enabled: true, apiKey: "synthetic" }), stamp: () => "1", available: () => true,
      prepare: async () => preview, provider: () => ({ assess }), release,
    });
    const modal = new OverlapModal(f.app as never, session); modal.open(); await flush();
    const content = modal.contentEl as unknown as InstanceType<typeof mocks.FakeElement>;
    expect(assess).not.toHaveBeenCalled(); expect(content.findByTag("pre").map(p => p.text)).toEqual([preview.a.text, preview.b.text]);
    expect(content.findByTag("script")).toHaveLength(0); expect(content.findByTag("pre")[0].attributes.get("tabindex")).toBe("0");
    const run = content.findByClass("mod-cta")[0]; run.trigger("click"); await flush();
    expect(run.disabled).toBe(true); run.trigger("click"); session.onChange(); expect(assess).toHaveBeenCalledOnce();
    finish(); await flush(); expect(session.view.stage).toBe("result");
    expect(content.findByTag("p").some(p => p.text.includes(language === "ru" ? "единственную" : "single category"))).toBe(true);
    content.findByClass("ai-overlap-note")[1].trigger("click"); await flush();
    expect(f.leaf.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: "Folder/B.md" })); expect(f.view.editor.setCursor).toHaveBeenCalledWith({ line: 18, ch: 0 });
    session.invalidate(); expect(content.findByTag("p").some(p => p.text.includes(language === "ru" ? "устарела" : "stale"))).toBe(true);
    modal.close(); expect(release).toHaveBeenCalledOnce(); expect(content.children).toHaveLength(0); setLanguage("ru");
  });
});

describe("read-only Pair Inspector UI", () => {
  function events() {
    const listeners = new Map<string, Set<(file: { path: string }) => void>>();
    return {
      on: (event: string, listener: (file: { path: string }) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
        return { event, listener };
      },
      offref: vi.fn((ref: { event: string; listener: (file: { path: string }) => void }) => { listeners.get(ref.event)!.delete(ref.listener); }),
      emit: (event: string, path = "one/Same.md") => { for (const listener of listeners.get(event) ?? []) listener({ path }); },
    };
  }
  async function fixture(withAnalysis = false, transport = false) {
    const { PairInspectorModal } = await import("../consolidation/pairInspectorModal");
    const files = new Map(["one/Same.md", "two/Same.md"].map(path => [path, Object.assign(new mocks.TFile(), {
      path, basename: "Same", stat: { mtime: 1, size: 100 },
    })]));
    const bodies = new Map([["one/Same.md", '![[two/Same]]\n<img src="https://invalid.test/pixel">'], ["two/Same.md", "B own source"]]);
    const leaf = { openFile: vi.fn(async () => undefined) };
    const app = {
      vault: { ...events(), getFileByPath: vi.fn((path: string) => files.get(path) ?? null),
        read: vi.fn(async (file: { path: string }) => bodies.get(file.path)!), modify: vi.fn(), create: vi.fn() },
      metadataCache: { ...events(), getFileCache: vi.fn(() => null), resolvedLinks: {} },
      workspace: { getLeaf: () => leaf },
    };
    const { RelationshipSession, readRelationshipPair } = await import("../consolidation/relationshipSession");
    const model: LanguageModelSettingsSnapshot = { provider: "custom", model: "test-model", baseUrl: "https://example.test/v1", apiKey: "secret-key", temperature: 0.3, topK: 10 };
    const listeners = new Set<() => void>();
    const internalResponse = () => ({ relation: "related_distinct", explanation: { text: "Preliminary interpretation", evidence: ["c1"] },
      claims: [{ id: "c1", kind: "comparison", text: "Model interpretation", quoteA: bodies.get("one/Same.md")!, quoteB: bodies.get("two/Same.md")! }],
      recommendation: { action: "add_link", reason: "Consider a link after review", evidence: ["c1"] }, alternatives: [], limitations: ["Only these sources"] });
    const complete = vi.fn(async (_settings: LanguageModelSettingsSnapshot, _system: string, user: string) => JSON.stringify(relationshipWireFixture(internalResponse(), user)));
    const factory = vi.fn(() => new RelationshipSession({ read: () => readRelationshipPair(app as never, ["one/Same.md", "two/Same.md"]),
      complete: transport ? (settings, system, user, signal, options) => callOpenRouter(settings, system, user, { ...options, signal }) : complete,
      settings: { get: () => model, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; } } }));
    const modal = new PairInspectorModal(app as never, ["one/Same.md", "two/Same.md"], withAnalysis ? factory : undefined);
    const content = modal.contentEl as unknown as InstanceType<typeof mocks.FakeElement>;
    const status = () => content.findByTag("div").find(el => el.attributes.get("role") === "status")!;
    const refresh = () => content.findByTag("button")[0].trigger("click");
    const action = (name: string) => content.findByTag("button").find(el => el.attributes.get("data-relationship-action") === name)!;
    const stage = () => content.findByTag("div").find(el => el.attributes.has("data-relationship-stage"))?.attributes.get("data-relationship-stage");
    return { app, files, bodies, leaf, modal, content, status, refresh, factory, complete, internalResponse, model, listeners, action, stage };
  }

  it.each(["null", "empty", "missing", "partial", "valid-length", "stop", "bad-quote"])("actual HTTP parser → session → validator → pair UI: %s", async variant => {
    vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.mocked(requestUrl).mockReset(); setLanguage("ru");
    const f = await fixture(true, true);
    try {
      f.model.provider = "openrouter"; f.model.model = "deepseek/deepseek-v4-flash-0731";
      f.modal.open(); await flush(); f.action("analyze").trigger("click"); await flush();
      const payload = f.content.findByClass("ai-relationship")[0].findByTag("pre")[0].text;
      const valid = relationshipWireFixture(f.internalResponse(), relationshipFixtureUser(payload));
      if (variant === "bad-quote") valid.claims[0].evidenceA = "unknown";
      const content = variant === "null" ? null : variant === "empty" ? "" : variant === "missing" ? undefined : variant === "partial" ? '{"relation":' : JSON.stringify(valid);
      const completed = ["stop", "bad-quote"].includes(variant);
      vi.mocked(requestUrl).mockResolvedValueOnce({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: completed ? "stop" : "length",
        message: { content, reasoning: "synthetic-private-reasoning" } }], usage: { completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 4000 } } }) } as never);
      expect(payload).toContain('"max_tokens":8192'); expect(payload).toContain('"reasoning":{"enabled":false}');
      const confirm = f.action("confirm"); confirm.trigger("click"); confirm.trigger("click"); await flush(); await flush();
      await vi.waitFor(() => expect(f.stage()).toBe(variant === "stop" ? "result" : "error"));
      confirm.trigger("click"); expect(requestUrl).toHaveBeenCalledOnce();
      expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body: payload });
      const session = f.factory.mock.results[0].value as import("../consolidation/relationshipSession").RelationshipSession;
      const all = f.content.findByTag("p").map(el => el.text).join("\n") + f.content.findByTag("div").map(el => el.text).join("\n");
      expect(all).not.toContain("synthetic-private-reasoning");
      if (!completed) {
        expect(session.view.error).toBe("outputLimit"); expect(all).toContain("Модель достигла лимита генерации до завершения анализа");
        expect(all).not.toContain("invalidEnvelope");
      }
      if (variant === "bad-quote") expect(session.view.error).toBe("unverifiedEvidence");
      expect(f.content.findByTag("button").some(el => el.attributes.get("data-planner-action") === "open")).toBe(variant === "stop");
      expect(f.content.findByTag("button").some(el => el.attributes.get("data-safe-action") === "confirm")).toBe(false);
      expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled();
    } finally { f.modal.close(); vi.unstubAllGlobals(); vi.mocked(requestUrl).mockReset(); }
  });

  it("shows one current pair step and recovers explicitly after dismiss or source invalidation", async () => {
    const f = await fixture(true); f.modal.open(); await flush();
    const notes = () => f.content.findByClass("ai-pair-notes")[0];
    const planning = () => f.content.findByClass("ai-change-planner")[0];
    const analysis = () => f.content.findByClass("ai-relationship")[0];
    expect(notes().hidden).toBe(false); expect(planning().hidden).toBe(true);
    expect(f.content.findByClass("ai-pair-source").map(el => el.text)).toEqual([...f.bodies.values()]);
    f.action("analyze").trigger("click"); await flush(); expect(notes().hidden).toBe(true);
    f.action("confirm").trigger("click"); await flush(); expect(f.stage()).toBe("result");
    const unavailable = f.content.findByTag("button").find(el => el.attributes.get("data-planner-action") === "open")!;
    expect(unavailable.disabled).toBe(true); unavailable.trigger("click"); await flush();
    expect(analysis().hidden).toBe(false); expect(planning().hidden).toBe(true); expect(f.complete).toHaveBeenCalledOnce();
    f.action("dismiss").trigger("click"); expect(f.action("analyze").hidden).toBe(false); expect(notes().hidden).toBe(false);
    f.action("analyze").trigger("click"); await flush(); f.action("confirm").trigger("click"); await flush();
    const reads = f.app.vault.read.mock.calls.length; f.app.vault.emit("modify");
    expect(f.stage()).toBe("stale"); expect(f.action("analyze").hidden).toBe(false); expect(f.app.vault.read).toHaveBeenCalledTimes(reads);
    expect(f.content.findByTag("button").some(el => el.attributes.get("data-planner-action") === "open")).toBe(false);
    f.refresh(); await flush(); expect(f.app.vault.read.mock.calls.length).toBeGreaterThan(reads); f.modal.close();
  });

  it("never offers preparation when a response contains a quote absent from the exact sources", async () => {
    const f = await fixture(true);
    const invalid = f.internalResponse();
    invalid.claims[0].quoteA = "A fabricated excerpt";
    f.complete.mockClear(); f.complete.mockResolvedValueOnce(JSON.stringify(invalid));
    f.modal.open(); await flush(); f.action("analyze").trigger("click"); await flush(); f.action("confirm").trigger("click"); await flush();
    expect(f.stage()).toBe("error"); expect(f.complete).toHaveBeenCalledOnce();
    expect(f.content.findByTag("button").some(el => el.attributes.get("data-planner-action") === "open")).toBe(false);
    expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled(); f.modal.close();
  });

  it("offers an explicit action alongside Decisions and never invokes either on list rendering", async () => {
    const f = discoveryHarness(), inspectPair = vi.fn(), assessOverlap = vi.fn();
    const modal = new SemanticDuplicatesModal(f.app as never, { ...f.delegate, inspectPair, assessOverlap });
    modal.open(); await flush();
    expect(inspectPair).not.toHaveBeenCalled(); expect(assessOverlap).not.toHaveBeenCalled();
    const buttons = (modal.contentEl as unknown as InstanceType<typeof mocks.FakeElement>).findByTag("button");
    expect(buttons).toHaveLength(2);
    buttons[1].trigger("click"); expect(inspectPair).toHaveBeenCalledWith(expect.objectContaining({ leftPath: "A.md", rightPath: "Folder/B.md" }));
    expect(assessOverlap).not.toHaveBeenCalled();
    buttons[0].trigger("click"); expect(assessOverlap).toHaveBeenCalledOnce(); modal.close();
  });

  it.each(["en", "ru"] as const)("renders safe current text and full paths; opens the selected note in %s", async language => {
    const { setLanguage } = await import("../i18n"); setLanguage(language);
    const f = await fixture(); expect(f.app.vault.read).not.toHaveBeenCalled();
    f.modal.open(); await flush();
    expect(f.content.findByClass("ai-semantic-result-path").map(el => el.text)).toEqual(["one/Same.md", "two/Same.md"]);
    expect(f.content.findByClass("ai-pair-source").map(el => el.text)).toEqual([...f.bodies.values()]);
    expect(f.content.findByTag("img")).toHaveLength(0); expect(f.content.findByTag("iframe")).toHaveLength(0);
    expect(f.content.findByTag("p").some(el => el.text.includes("@consolidation."))).toBe(false);
    expect(f.content.findByTag("p").map(el => el.text).join(" ")).toContain(language === "en" ? "Metadata unavailable" : "Метаданные недоступны");
    f.content.findByClass("ai-pair-note")[1].findByTag("button")[0].trigger("click"); await flush();
    expect(f.leaf.openFile).toHaveBeenCalledWith(f.files.get("two/Same.md")); expect(f.content.findByClass("ai-pair-source")).toHaveLength(2);
    f.modal.close(); expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled();
    setLanguage("ru");
  });

  it("ignores late reads after close, removes listeners and can reopen", async () => {
    const f = await fixture(); let release!: (text: string) => void;
    f.app.vault.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.modal.open(); f.modal.close();
    expect(f.content.children).toHaveLength(0); expect(f.app.vault.offref).toHaveBeenCalledTimes(4);
    expect(f.app.metadataCache.offref).toHaveBeenCalledTimes(2);
    f.app.vault.emit("modify"); expect(f.content.children).toHaveLength(0);
    f.modal.open(); await flush(); expect(f.content.findByClass("ai-pair-source")[0].text).toBe(f.bodies.get("one/Same.md"));
    release("late closed source"); await flush();
    expect(f.content.findByClass("ai-pair-source")[0].text).toBe(f.bodies.get("one/Same.md"));
    f.modal.close();
  });

  it("keeps only the latest refresh and invalidates without automatic IO", async () => {
    const f = await fixture(); let release!: (text: string) => void;
    f.app.vault.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.modal.open(); f.bodies.set("one/Same.md", "fresh source"); f.refresh(); await flush();
    release("late old source"); await flush();
    expect(f.content.findByClass("ai-pair-source")[0].text).toBe("fresh source"); expect(f.app.vault.read).toHaveBeenCalledTimes(4);
    f.app.vault.emit("modify"); f.app.metadataCache.emit("resolved");
    expect(f.status().attributes.get("data-state")).toBe("stale"); expect(f.app.vault.read).toHaveBeenCalledTimes(4);
    f.files.delete("one/Same.md"); f.refresh(); await flush();
    expect(f.content.findByClass("ai-pair-source")).toHaveLength(1); expect(f.content.findByClass("ai-pair-source")[0].text).toBe("B own source");
    f.modal.close();
  });

  it("does not publish a pending load after a file/cache change", async () => {
    const f = await fixture(); let release!: (text: string) => void;
    f.app.vault.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.modal.open(); f.app.metadataCache.emit("changed"); release("outdated source"); await flush();
    expect(f.status().attributes.get("data-state")).toBe("stale"); expect(f.content.findByClass("ai-pair-source")).toHaveLength(0);
    f.refresh(); await flush(); expect(f.content.findByClass("ai-pair-source")).toHaveLength(2); f.modal.close();
  });

  it("labels a truncated preview and distinguishes an empty file", async () => {
    const f = await fixture(); f.bodies.set("one/Same.md", "X".repeat(13000)); f.bodies.set("two/Same.md", "");
    f.modal.open(); await flush();
    expect(f.content.findByClass("ai-pair-source").map(el => el.text.length)).toEqual([12000, 0]);
    expect(f.content.findByTag("p").some(el => el.text.includes("усечён"))).toBe(true);
    expect(f.content.findByTag("p").some(el => el.text.includes("файл пуст"))).toBe(true); f.modal.close();
  });

  it("bounds metadata lists and long entries with explicit truncation labels", async () => {
    const f = await fixture();
    f.app.metadataCache.getFileCache.mockReturnValue({ headings: Array.from({ length: 101 }, () => ({ level: 1, heading: "X".repeat(600) })) } as never);
    f.modal.open(); await flush();
    expect(f.content.findByClass("ai-pair-note").flatMap(note => note.findByTag("li"))).toHaveLength(200);
    expect(f.content.findByClass("ai-pair-note")[0].findByTag("li")[0].text).toMatch(/усечено/);
    expect(f.content.findByTag("p").some(el => el.text.includes("100 из 101"))).toBe(true);
    f.modal.close();
  });

  it.each(["ru", "en"] as const)("keeps viewing local and requires exact-data confirmation in %s", async language => {
    const { setLanguage } = await import("../i18n"); setLanguage(language);
    const f = await fixture(true); f.modal.open(); await flush();
    expect(f.factory).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled();
    f.action("analyze").trigger("click"); await flush(); expect(f.stage()).toBe("consent"); expect(f.complete).not.toHaveBeenCalled();
    expect(f.content.findByTag("pre").some(el => el.text.includes('"messages"'))).toBe(true);
    expect(f.content.findByTag("pre").some(el => el.text.includes("secret-key"))).toBe(false);
    const send = f.action("confirm"); send.trigger("click"); send.trigger("click"); await flush();
    expect(f.complete).toHaveBeenCalledOnce(); expect(f.stage()).toBe("result");
    expect(f.content.findByTag("img")).toHaveLength(0);
    expect(f.content.findByTag("p").some(el => el.text.includes("@relationship"))).toBe(false);
    f.action("dismiss").trigger("click"); expect(f.stage()).toBe("dismissed");
    expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled();
    f.modal.close(); expect(f.listeners.size).toBe(0); setLanguage("ru");
  });

  it.each(["ru", "en"] as const)("renders only supplied quotes for contextual, unique and conflicting claims in %s", async language => {
    const { setLanguage, t } = await import("../i18n"); setLanguage(language);
    for (const name of ["theory_and_context", "partial_overlap", "contradiction"]) {
      const item = relationshipCases.find(c => c.name === name)!;
      const f = await fixture(true);
      f.bodies.set("one/Same.md", item.a); f.bodies.set("two/Same.md", item.b);
      f.complete.mockImplementation(async (_s, _sys, user) => JSON.stringify(relationshipWireFixture(item.response, user)));
      f.modal.open(); await flush(); f.action("analyze").trigger("click"); await flush();
      expect(f.complete).not.toHaveBeenCalled(); f.action("confirm").trigger("click"); await flush();
      expect(f.stage()).toBe("result"); expect(f.complete).toHaveBeenCalledOnce();
      const cards = f.content.findByClass("ai-semantic-duplicate-card"); expect(cards).toHaveLength(item.response.claims.length);
      item.response.claims.forEach((claim, i) => {
        const quotes = cards[i].findByTag("pre").map(el => el.text);
        expect(quotes).toEqual([claim.quoteA, claim.quoteB].filter(quote => quote !== null));
        for (const [side, quote] of [["A", claim.quoteA], ["B", claim.quoteB]] as const) {
          expect(cards[i].findByTag("p").some(el => el.text === t("@relationship.verifiedQuote", { side }))).toBe(quote !== null);
        }
      });
      expect(f.content.findByTag("p").some(el => el.text === t("@relationship.evidenceScope"))).toBe(true);
      expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled(); f.modal.close();
    }
    setLanguage("ru");
  });

  it("invalidates consent/results on selected file and model changes, and cancels when closing", async () => {
    const f = await fixture(true); f.modal.open(); await flush(); f.action("analyze").trigger("click"); await flush();
    f.app.vault.emit("modify"); expect(f.stage()).toBe("stale"); expect(f.action("confirm")).toBeUndefined();
    f.action("analyze").trigger("click"); await flush(); f.model.model = "changed"; for (const fn of f.listeners) fn();
    expect(f.stage()).toBe("stale"); expect(f.complete).not.toHaveBeenCalled();
    f.action("analyze").trigger("click"); await flush();
    let release!: (text: string) => void; f.complete.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    f.action("confirm").trigger("click"); await flush(); f.modal.close(); release("late response"); await flush();
    expect(f.content.children).toHaveLength(0); expect(f.listeners.size).toBe(0);
  });
  it.each(["ru", "en"] as const)("plans only after explicit selection, confirms exact ranges and clears stale UI in %s", async language => {
    const { setLanguage } = await import("../i18n"); setLanguage(language);
    const f = await fixture(true);
    f.bodies.set("one/Same.md", plannerFixture.a); f.bodies.set("two/Same.md", plannerFixture.b);
    f.complete.mockImplementation(async (_s, _sys, user) => JSON.stringify(relationshipWireFixture(plannerFixture.response, user)));
    Object.assign(f.app.metadataCache, {
      getFileCache: (file: { path: string }) => {
        const content = f.bodies.get(file.path)!; let offset = 0;
        return { sections: content.trimEnd().split("\n\n").map(text => {
          const start = content.indexOf(text, offset); offset = start + text.length;
          return { type: "paragraph", position: { start: { offset: start }, end: { offset } } };
        }) };
      },
      getFirstLinkpathDest: (path: string) => f.files.get(`${path}.md`) ?? null,
    });
    const button = (name: string) => f.content.findByTag("button").find(el => el.attributes.get("data-planner-action") === name)!;
    const select = (name: string, value: string) => {
      const input = f.content.findByTag("select").find(el => el.attributes.get("data-planner-field") === name)!;
      input.value = value; input.trigger("change");
    };
    f.modal.open(); await flush(); expect(button("open")).toBeUndefined();
    f.action("analyze").trigger("click"); await flush(); f.action("confirm").trigger("click"); await flush();
    const reads = f.app.vault.read.mock.calls.length; expect(button("open")).toBeDefined(); expect(button("build")).toBeUndefined();
    const oldPrepare = button("open");
    oldPrepare.trigger("click"); oldPrepare.trigger("click"); await flush(); expect(f.app.vault.read).toHaveBeenCalledTimes(reads + 2);
    expect(f.content.findByTag("select").find(el => el.attributes.get("data-planner-field") === "source")!.value).toBe("0");
    expect(f.content.findByTag("select").find(el => el.attributes.get("data-planner-field") === "operation")).toBeUndefined();
    expect(button("build").disabled).toBe(true);
    select("range", "0"); expect(button("build").disabled).toBe(true);
    const checkbox = f.content.findByTag("input").find(el => el.attributes.get("data-planner-field") === "confirm")!;
    checkbox.checked = true; checkbox.trigger("change"); expect(button("build").disabled).toBe(false);
    button("build").trigger("click"); await flush();
    expect(f.content.findByClass("ai-proposal-removed")).toHaveLength(1); expect(f.content.findByClass("ai-proposal-added")).toHaveLength(1);
    const after = f.content.findByTag("pre").find(el => el.attributes.get("data-planner-text") === "after")!;
    expect(after.text).toBe("![[two/Same]]" + plannerFixture.a.slice(plannerFixture.response.claims[0].quoteA.length));
    expect(f.content.findByTag("img")).toHaveLength(0); expect(f.complete).toHaveBeenCalledOnce();
    select("range", ""); expect(f.content.findByClass("ai-planner-result")).toHaveLength(0); expect(button("build").disabled).toBe(true);
    select("range", "0");
    const renewed = f.content.findByTag("input").find(el => el.attributes.get("data-planner-field") === "confirm")!;
    expect(renewed.checked).toBe(false); renewed.checked = true; renewed.trigger("change");
    button("build").trigger("click"); await flush(); expect(f.content.findByClass("ai-planner-result")).toHaveLength(1);
    const beforeEvent = f.app.vault.read.mock.calls.length; f.app.metadataCache.emit("resolved");
    expect(f.content.findByClass("ai-planner-result")).toHaveLength(0); expect(f.stage()).toBe("result");
    expect(f.app.vault.read).toHaveBeenCalledTimes(beforeEvent + 2); expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled();
    f.modal.close(); expect(f.content.children).toHaveLength(0);
    oldPrepare.trigger("click"); await flush(); expect(f.app.vault.read).toHaveBeenCalledTimes(beforeEvent + 2);
    setLanguage("ru");
  });

  it("removes a completed result when a selected source is deleted, without rereading or writing", async () => {
    const f = await fixture(true); f.modal.open(); await flush();
    f.action("analyze").trigger("click"); await flush(); f.action("confirm").trigger("click"); await flush();
    expect(f.stage()).toBe("result"); const reads = f.app.vault.read.mock.calls.length;
    f.app.vault.emit("modify", "unrelated.md"); expect(f.stage()).toBe("result");
    f.files.delete("one/Same.md"); f.app.vault.emit("delete");
    expect(f.stage()).toBe("stale"); expect(f.action("dismiss")).toBeUndefined();
    expect(f.app.vault.read).toHaveBeenCalledTimes(reads); expect(f.complete).toHaveBeenCalledOnce();
    expect(f.app.vault.modify).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled(); f.modal.close();
  });
});
