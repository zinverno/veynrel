import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { RefinedSearchUpdate } from "../rerank/types";

const mocks = vi.hoisted(() => {
  interface FakeEvent {
    key?: string;
    preventDefault?: () => void;
  }

  class FakeElement {
    readonly children: FakeElement[] = [];
    readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
    tag = "div";
    cls = "";
    text = "";
    value = "";
    disabled = false;
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
      this.children.push(child);
      return child;
    }

    addClass(value: string) {
      this.cls = `${this.cls} ${value}`.trim();
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
    content.findByClass("ai-semantic-duplicate-note")[1].trigger("keydown", {
      key: "Enter",
    });
    await flush();
    expect(leaf.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Folder/B.md" }),
    );
    expect(view.editor.setCursor).toHaveBeenCalledWith({ line: 18, ch: 0 });
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
