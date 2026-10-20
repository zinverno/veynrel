import { App, MarkdownView, Modal, Notice, TFile } from "obsidian";
import { t as tr } from "../i18n";
import type {
  SemanticChunkMatch,
  SemanticDocumentSimilarity,
  SemanticDuplicatePair,
} from "./types";
import {
  formatSemanticScore,
  semanticBasename,
  semanticBreadcrumb,
} from "./semanticSearchModal";

export interface SemanticDiscoveryModalDelegate {
  findSimilarNotes(path: string): Promise<SemanticDocumentSimilarity[]>;
  findPotentialDuplicates(): Promise<SemanticDuplicatePair[]>;
  assessOverlap?(pair: SemanticDuplicatePair): void;
  inspectPair?(pair: SemanticDuplicatePair): void;
  errorMessage(error: unknown): string;
}

function renderMatches(
  container: HTMLElement,
  matches: readonly SemanticChunkMatch[],
  collapsible = false,
): void {
  for (const match of matches) {
    const fragment = container.createDiv({
      cls: "ai-semantic-result-fragment",
    });
    const breadcrumb = semanticBreadcrumb(match.headingPath);
    if (breadcrumb) {
      fragment.createDiv({
        cls: "ai-semantic-result-heading",
        text: breadcrumb,
      });
    }
    if (match.preview) {
      let target: HTMLElement = fragment;
      if (collapsible && match.preview.length > 240) {
        const details = fragment.createEl("details");
        const end = /[\uD800-\uDBFF]/.test(match.preview[239]) ? 239 : 240;
        details.createEl("summary", { text: `${match.preview.slice(0, end)}…`, attr: { "aria-label": tr("@ux.expandFragment") } });
        target = details;
      }
      target.createDiv({
        cls: "ai-semantic-result-preview",
        text: match.preview,
      });
    }
  }
}

async function openDiscoveryResult(
  app: App,
  path: string,
  bestMatch: SemanticChunkMatch | undefined,
  onOpened: () => void,
): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!(file instanceof TFile)) {
    new Notice(tr("Заметка больше не существует."));
    return;
  }
  try {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (bestMatch && leaf.view instanceof MarkdownView) {
      const position = { line: bestMatch.source.startLine, ch: 0 };
      try {
        leaf.view.editor.setCursor(position);
        leaf.view.editor.scrollIntoView(
          { from: position, to: position },
          true,
        );
        leaf.view.editor.focus();
      } catch {
        // Exact-path opening is primary; chunk navigation is best effort.
      }
    }
    onOpened();
  } catch {
    new Notice(tr("Не удалось открыть найденную заметку."));
  }
}

function makeInteractive(
  element: HTMLElement,
  open: () => void,
): void {
  element.addEventListener("click", open);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
}

export class SemanticSimilarNotesModal extends Modal {
  private openState = false;
  private requestGeneration = 0;

  constructor(
    app: App,
    private readonly delegate: SemanticDiscoveryModalDelegate,
    private readonly sourcePath: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.openState = true;
    this.titleEl.setText(tr("Похожие заметки"));
    this.contentEl.empty();
    this.contentEl.addClass(
      "ai-semantic-search-modal",
      "ai-semantic-discovery-modal",
    );
    this.contentEl.createDiv({
      cls: "ai-semantic-discovery-source",
      text: tr("Текущая заметка: {path}", { path: this.sourcePath }),
    });
    const status = this.contentEl.createDiv({
      cls: "ai-semantic-search-status",
      text: tr("Ищу похожие заметки в локальном индексе..."),
      attr: { "data-state": "loading" },
    });
    const results = this.contentEl.createDiv({
      cls: "ai-semantic-result-list",
    });
    const request = ++this.requestGeneration;
    void this.load(request, status, results);
  }

  onClose(): void {
    this.openState = false;
    this.requestGeneration++;
    this.contentEl.empty();
  }

  private async load(
    request: number,
    status: HTMLElement,
    resultsEl: HTMLElement,
  ): Promise<void> {
    try {
      const results = await this.delegate.findSimilarNotes(this.sourcePath);
      if (!this.isCurrent(request)) return;
      if (results.length === 0) {
        status.setText(tr("Похожие заметки не найдены."));
        status.setAttribute("data-state", "empty");
        return;
      }
      status.setText(
        tr("Найдено похожих заметок: {n}", { n: results.length }),
      );
      status.setAttribute("data-state", "ready");
      this.renderResults(resultsEl, results);
    } catch (error) {
      if (!this.isCurrent(request)) return;
      status.setText(this.delegate.errorMessage(error));
      status.setAttribute("data-state", "error");
    }
  }

  private renderResults(
    resultsEl: HTMLElement,
    results: readonly SemanticDocumentSimilarity[],
  ): void {
    for (const result of results) {
      const card = resultsEl.createDiv({
        cls: "ai-semantic-result-card",
        attr: {
          role: "button",
          tabindex: "0",
          "aria-label": tr("Открыть заметку {path}", { path: result.path }),
        },
      });
      const header = card.createDiv({ cls: "ai-semantic-result-header" });
      header.createDiv({
        cls: "ai-semantic-result-title",
        text: semanticBasename(result.path),
      });
      header.createSpan({
        cls: "ai-semantic-result-score",
        text: formatSemanticScore(result.score),
      });
      card.createDiv({
        cls: "ai-semantic-result-path",
        text: result.path,
      });
      renderMatches(card, result.matches);
      makeInteractive(card, () => {
        void openDiscoveryResult(
          this.app,
          result.path,
          result.matches[0],
          () => this.close(),
        );
      });
    }
  }

  private isCurrent(request: number): boolean {
    return this.openState && request === this.requestGeneration;
  }
}

export class SemanticDuplicatesModal extends Modal {
  private openState = false;
  private requestGeneration = 0;

  constructor(
    app: App,
    private readonly delegate: SemanticDiscoveryModalDelegate,
  ) {
    super(app);
  }

  onOpen(): void {
    this.openState = true;
    this.modalEl.addClass("ai-semantic-duplicates-modal");
    this.titleEl.setText(tr("Сильно похожие заметки"));
    this.contentEl.empty();
    this.contentEl.addClass(
      "ai-semantic-search-modal",
      "ai-semantic-discovery-modal",
    );
    this.contentEl.createDiv({
      cls: "ai-semantic-duplicate-disclaimer",
      text: tr(
        "Высокая semantic similarity указывает на потенциальное пересечение, но не доказывает, что заметки идентичны.",
      ),
    });
    const status = this.contentEl.createDiv({
      cls: "ai-semantic-search-status",
      text: tr("Проверяю локальный индекс на сильно похожие заметки..."),
      attr: { "data-state": "loading" },
    });
    const results = this.contentEl.createDiv({
      cls: "ai-semantic-duplicate-list",
    });
    const request = ++this.requestGeneration;
    void this.load(request, status, results);
  }

  onClose(): void {
    this.openState = false;
    this.requestGeneration++;
    this.contentEl.empty();
  }

  private async load(
    request: number,
    status: HTMLElement,
    resultsEl: HTMLElement,
  ): Promise<void> {
    try {
      const pairs = await this.delegate.findPotentialDuplicates();
      if (!this.isCurrent(request)) return;
      if (pairs.length === 0) {
        status.setText(tr("Сильно похожие пары не найдены."));
        status.setAttribute("data-state", "empty");
        return;
      }
      status.setText(
        tr("Найдено потенциально похожих пар: {n}", { n: pairs.length }),
      );
      status.setAttribute("data-state", "ready");
      this.renderPairs(resultsEl, pairs);
    } catch (error) {
      if (!this.isCurrent(request)) return;
      status.setText(this.delegate.errorMessage(error));
      status.setAttribute("data-state", "error");
    }
  }

  private renderPairs(
    resultsEl: HTMLElement,
    pairs: readonly SemanticDuplicatePair[],
  ): void {
    for (const pair of pairs) {
      const card = resultsEl.createDiv({
        cls: "ai-semantic-duplicate-card",
      });
      const header = card.createDiv({
        cls: "ai-semantic-duplicate-header",
      });
      header.createSpan({
        cls: "ai-semantic-duplicate-label",
        text: tr("Потенциально похожая пара"),
      });
      header.createSpan({
        cls: "ai-semantic-result-score",
        text: formatSemanticScore(pair.score),
      });
      const notes = card.createDiv({
        cls: "ai-semantic-duplicate-notes",
      });
      this.renderDocument(
        notes,
        pair.leftPath,
        pair.leftMatches,
      );
      this.renderDocument(
        notes,
        pair.rightPath,
        pair.rightMatches,
      );
      const actions = card.createDiv({ cls: "ai-consolidation-actions" });
      if (this.delegate.assessOverlap) {
        const assess = actions.createEl("button", { text: tr("@decisions.title"), attr: { type: "button" } });
        assess.addEventListener("click", () => this.delegate.assessOverlap?.(pair));
      }
      if (this.delegate.inspectPair) {
        const inspect = actions.createEl("button", { text: tr("@consolidation.inspect"), attr: { type: "button" } });
        inspect.addEventListener("click", () => this.delegate.inspectPair?.(pair));
      }
    }
  }

  private renderDocument(
    container: HTMLElement,
    path: string,
    matches: readonly SemanticChunkMatch[],
  ): void {
    const note = container.createDiv({
      cls: "ai-semantic-duplicate-note",
    });
    const title = note.createDiv({
      cls: "ai-semantic-result-title",
      text: semanticBasename(path),
      attr: { role: "button", tabindex: "0", "aria-label": tr("Открыть заметку {path}", { path }) },
    });
    note.createDiv({ cls: "ai-semantic-result-path", text: path });
    renderMatches(note, matches, true);
    makeInteractive(title, () => {
      void openDiscoveryResult(this.app, path, matches[0], () => this.close());
    });
  }

  private isCurrent(request: number): boolean {
    return this.openState && request === this.requestGeneration;
  }
}

export { openDiscoveryResult };
