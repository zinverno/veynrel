import {
  App,
  MarkdownView,
  Modal,
  Notice,
  TFile,
} from "obsidian";
import { t as tr } from "../i18n";
import { SemanticNotReadyError } from "./errors";
import type { ManualRerankSession, RefinedDocumentResult, RefinedSearchUpdate } from "../rerank/types";
import type {
  SemanticDocumentResult,
  SemanticRuntimeStats,
} from "./types";

export interface SemanticSearchModalDelegate {
  prepareSearch(): Promise<SemanticRuntimeStats>;
  search(query: string): Promise<SemanticDocumentResult[]>;
  isSearchAvailable?(): boolean;
  searchDiscover?(query: string, publish: (update: RefinedSearchUpdate) => void, signal: AbortSignal): Promise<RefinedSearchUpdate>;
  errorMessage(error: unknown): string;
}

export { formatSemanticScore } from "../utils/semanticPresentation";
import { formatSemanticScore } from "../utils/semanticPresentation";

export function semanticBreadcrumb(headings: readonly string[]): string {
  return headings.filter((heading) => heading.trim()).join(" › ");
}

export function semanticBasename(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "") || path;
}

export class SemanticSearchModal extends Modal {
  private inputEl: HTMLInputElement | null = null;
  private searchButton: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private refinementEl: HTMLElement | null = null;
  private session: ManualRerankSession | null = null;
  private original: RefinedDocumentResult[] = [];
  private refined: RefinedSearchUpdate | null = null;
  private refining = false;
  private retry = false;
  private showRefined = true;
  private busy = false;
  private openState = false;
  private requestGeneration = 0;
  private request: AbortController | null = null;

  constructor(
    app: App,
    private readonly delegate: SemanticSearchModalDelegate,
  ) {
    super(app);
  }

  onOpen(): void {
    this.openState = true;
    this.titleEl.setText(tr("Семантический поиск"));
    this.contentEl.empty();
    this.contentEl.addClass("ai-semantic-search-modal");
    this.contentEl.addClass("ai-semantic-search-dialog");

    const inputRow = this.contentEl.createDiv({
      cls: "ai-semantic-search-input-row",
    });
    this.inputEl = inputRow.createEl("input", {
      type: "text",
      attr: {
        placeholder: tr("Введите смысловой запрос"),
        "aria-label": tr("Семантический поисковый запрос"),
      },
    });
    this.searchButton = inputRow.createEl("button", {
      text: tr("Найти"),
      cls: "mod-cta",
    });
    this.statusEl = this.contentEl.createDiv({
      cls: "ai-semantic-search-status",
      attr: { role: "status", "aria-live": "polite" },
    });
    this.resultsEl = this.contentEl.createDiv({
      cls: "ai-semantic-result-list",
    });
    this.refinementEl = this.contentEl.createDiv({ cls: "ai-semantic-refinement" });

    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.runSearch();
      }
    });
    this.inputEl.addEventListener("input", () => {
      if (!this.request || this.busy) return;
      this.request.abort();
      this.request = null;
      this.requestGeneration++;
      this.clearRefinement();
      this.setStatus(tr("@rerank.skipped.obsolete"), "skipped");
    });
    this.searchButton.addEventListener("click", () => {
      void this.runSearch();
    });
    this.inputEl.focus();
  }

  onClose(): void {
    this.request?.abort();
    this.request = null;
    this.openState = false;
    this.busy = false;
    this.requestGeneration++;
    this.clearRefinement();
    this.contentEl.empty();
    this.inputEl = null;
    this.searchButton = null;
    this.statusEl = null;
    this.resultsEl = null;
    this.refinementEl = null;
  }

  private async runSearch(): Promise<void> {
    if (this.busy || !this.inputEl) return;
    const query = this.inputEl.value.trim();
    if (!query) {
      this.setStatus(tr("Введите непустой запрос."), "empty");
      return;
    }

    this.busy = true;
    this.request?.abort();
    this.clearRefinement();
    const cancellation = new AbortController();
    this.request = cancellation;
    const request = ++this.requestGeneration;
    this.setBusy(true);
    this.setStatus(tr("Ищу по семантическому индексу..."), "loading");
    this.resultsEl?.empty();
    try {
      const stats = await this.delegate.prepareSearch();
      if (!this.isCurrent(request)) return;
      if (stats.vectorCount <= 0) {
        throw new SemanticNotReadyError(
          tr("Семантический индекс пуст. Сначала обновите индекс Vault."),
        );
      }
      if (this.delegate.searchDiscover) {
        const update = await this.delegate.searchDiscover(query, update => {
          if (!this.isCurrent(request)) return;
          this.busy = false;
          this.setBusy(false);
          this.renderUpdate(update);
        }, cancellation.signal);
        if (this.isCurrent(request)) this.renderUpdate(update);
        return;
      }
      const results = await this.delegate.search(query);
      if (!this.isCurrent(request)) return;
      if (results.length === 0) {
        this.setStatus(tr("Подходящие заметки не найдены."), "empty");
        return;
      }
      this.setStatus(
        tr("Найдено заметок: {n}", { n: results.length }),
        "ready",
      );
      this.renderResults(results);
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.setStatus(this.delegate.errorMessage(error), "error");
    } finally {
      if (this.isCurrent(request)) {
        // The cancellation signal owns the saved manual pool until input, close or a new search.
        if (!this.session) this.request = null;
        this.busy = false;
        this.setBusy(false);
      }
    }
  }

  private isCurrent(request: number): boolean {
    return this.openState && request === this.requestGeneration && this.delegate.isSearchAvailable?.() !== false;
  }

  private setBusy(value: boolean): void {
    if (this.searchButton) this.searchButton.disabled = value;
    if (this.inputEl) this.inputEl.disabled = value;
  }

  private setStatus(
    text: string,
    kind: "loading" | "empty" | "error" | "ready" | RefinedSearchUpdate["stage"],
  ): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    this.statusEl.setAttribute("data-state", kind);
  }

  private renderUpdate(update: RefinedSearchUpdate): void {
    if (update.session) {
      this.session = update.session;
      this.original = update.results;
    }
    if (update.reason === "obsolete") this.clearRefinement();
    if (this.session && update.stage === "reranked") this.refined = update;
    this.renderResults(update.results);
    if (!this.refining) this.renderRefinement();
    if (update.stage === "skipped" && update.reason === "disabled") {
      this.setStatus(update.results.length ? tr("Найдено заметок: {n}", { n: update.results.length }) :
        tr("Подходящие заметки не найдены."), update.results.length ? "ready" : "empty");
      return;
    }
    const key = update.stage === "skipped" ? `@rerank.skipped.${update.reason}` :
      update.stage === "reranked" && update.evaluated !== update.candidates ? "@rerank.partial" : `@rerank.${update.stage}`;
    this.setStatus(tr(key, { evaluated: update.evaluated ?? 0, candidates: update.candidates ?? 0 }), update.stage);
  }

  private clearRefinement(): void {
    this.session = null;
    this.original = [];
    this.refined = null;
    this.refining = false;
    this.retry = false;
    this.showRefined = true;
    this.refinementEl?.empty();
  }

  private renderRefinement(): void {
    const container = this.refinementEl;
    if (!container) return;
    const focused = container.ownerDocument?.activeElement?.getAttribute("data-rerank-action");
    container.empty();
    if (!this.session || !this.original.length) return;
    if (!this.session.configured) {
      container.createEl("p", { text: tr("@rerank.manual.configure"), cls: "setting-item-description" });
      return;
    }
    const actions = container.createDiv({ cls: "ai-semantic-refinement-actions" });
    if (this.refined) {
      for (const mode of ["original", "refined"] as const) {
        const selected = (mode === "refined") === this.showRefined;
        const button = actions.createEl("button", { text: tr(`@rerank.manual.${mode}`),
          attr: { "aria-pressed": String(selected), "data-rerank-action": mode } });
        button.addEventListener("click", () => {
          if (!this.session || !this.refined) return;
          this.showRefined = mode === "refined";
          this.renderUpdate(this.showRefined ? this.refined : { results: this.original, stage: "semantic" });
        });
        if (focused === mode) button.focus();
      }
      return;
    }
    const disclosureId = `ai-rerank-disclosure-${this.session.id}`;
    const button = actions.createEl("button", { text: tr("@rerank.manual.refine"),
      attr: { "data-rerank-action": "refine", "aria-describedby": disclosureId } });
    button.disabled = this.refining || this.original.length < 2;
    button.addEventListener("click", () => { void this.runRefinement(button); });
    container.createEl("p", { text: tr(this.retry ? "@rerank.manual.retry" : "@rerank.manual.disclosure"),
      cls: "setting-item-description", attr: { id: disclosureId } });
    if (this.original.length < 2) {
      container.createEl("p", { text: tr("@rerank.skipped.insufficient"), cls: "setting-item-description" });
    }
    if (focused === "refine") button.focus();
  }

  private async runRefinement(button: HTMLButtonElement): Promise<void> {
    const session = this.session;
    if (!session || !session.configured || this.refining || this.refined || this.original.length < 2) return;
    const generation = this.requestGeneration;
    const document = button.ownerDocument;
    const hadFocus = document?.activeElement === button;
    this.refining = true;
    button.disabled = true;
    try {
      const update = await session.refine();
      if (!this.isCurrent(generation) || this.session !== session) return;
      this.retry = update.stage === "fallback";
      this.renderUpdate(update);
    } catch {
      if (!this.isCurrent(generation) || this.session !== session) return;
      this.retry = true;
      this.renderUpdate({ stage: "fallback", results: this.original });
    } finally {
      if (this.isCurrent(generation) && this.session === session) {
        const restoreFocus = hadFocus && (document.activeElement === document.body || document.activeElement === button);
        this.refining = false;
        this.renderRefinement();
        if (restoreFocus) this.refinementEl?.querySelector<HTMLButtonElement>(
          `[data-rerank-action=${this.refined ? "refined" : "refine"}]`,
        )?.focus();
      }
    }
  }

  private renderResults(results: readonly RefinedDocumentResult[]): void {
    if (!this.resultsEl) return;
    this.resultsEl.empty();
    for (const result of results) {
      const card = this.resultsEl.createDiv({
        cls: "ai-semantic-result-card",
        attr: {
          role: "button",
          tabindex: "0",
          "aria-label": tr("Открыть заметку {path}", {
            path: result.path,
          }),
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

      for (const match of result.matches) {
        const fragment = card.createDiv({
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
          fragment.createDiv({
            cls: "ai-semantic-result-preview",
            text: match.preview,
          });
        }
      }

      const open = () => {
        void this.openResult(result);
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    }
  }

  private async openResult(result: RefinedDocumentResult): Promise<void> {
    const file = this.app.vault.getFileByPath(result.path);
    if (!(file instanceof TFile)) {
      new Notice(tr("Заметка больше не существует."));
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      const bestMatch = result.rerankMatch ?? result.matches[0];
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
          // Opening the note is primary; cursor movement is best effort.
        }
      }
      this.close();
    } catch {
      new Notice(tr("Не удалось открыть найденную заметку."));
    }
  }
}
