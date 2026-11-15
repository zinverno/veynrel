import type { Finding } from "../health/domain/finding";
import type { WorkspaceScope } from "../health/workspace/vaultScope";
import type { OrganizationRegistry } from "./organizationRegistry";
import { orgText, OrganizationRulesView, renderOrganizationSummary } from "./organizationView";
import { App, FuzzySuggestModal, Modal, Notice } from "obsidian";
import { t } from "../i18n";
import { categoryDefaults, categoryForTag, nextCategoryId, suggestTaxonomy, TAXONOMY_PURPOSES, TaxonomyError } from "./taxonomyProfile";
import type { TaxonomyCategory, TaxonomyProfilePort } from "./taxonomyProfile";
import { scanTaxonomy, taxonomyExclusions, taxonomyFileEligible } from "./taxonomyScan";
import { TaxonomySession } from "./taxonomySession";

import type { TFile } from "obsidian";
import type { TaxonomyInventory } from "./taxonomyScan";
import type { TagRecommendationSession } from "./tagRecommendationSession";
import { renderTagRecommendationView } from "./tagRecommendationView";
import { watchTaxonomyFreshness } from "./taxonomyFreshness";

class TagNotePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly choose: (path: string) => void) { super(app); this.setPlaceholder(t("@tagRec.select")); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles().filter(file => taxonomyFileEligible(this.app, file, [])); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file.path); }
}

let modalSequence = 0;
export class TagTaxonomyModal extends Modal {
  private readonly session: TaxonomySession;
  private readonly identity = `taxonomy-${++modalSequence}`;
  private exclusions = "";
  private organizationScope: WorkspaceScope = { kind: "all" };
  private rulesView?: OrganizationRulesView;
  private rulesOpen = false;
  private stopRegistry?: () => void;
  private organizationError = "";
  private decisionHistoryOpen = false;
  private decisionOperation?: AbortController;
  private status?: HTMLElement;
  private openState = false;
  private previousStage = "";
  private reviewButton?: HTMLButtonElement;
  private validation?: HTMLElement;
  private inventoryEl?: HTMLElement;
  private recommendationEl?: HTMLElement;
  private readonly recommendations?: TagRecommendationSession;
  private stopWatching?: () => void;
  constructor(app: App, private readonly port: TaxonomyProfilePort, private readonly release: () => void = () => {},
    createRecommendations?: (inventory: () => TaxonomyInventory | undefined) => TagRecommendationSession,
    private readonly organization?: { scope: WorkspaceScope; registry: OrganizationRegistry; findings?: readonly Finding[]; editRegistry?: () => void; tagNote?: (inventory?: TaxonomyInventory, exclusions?: string[]) => void }) {
    super(app);
    this.organizationScope = structuredClone(organization?.scope ?? { kind: "all" });
    this.session = new TaxonomySession(port, (excluded, signal, progress) => scanTaxonomy(app,
      [...excluded, ...(organization?.registry.path ? [organization.registry.path] : [])], signal, progress, undefined, organization ? this.organizationScope : undefined));
    if (organization) this.rulesView = new OrganizationRulesView(organization.registry, port.get(), () => { if (this.openState) this.render(); }, () => this.session.reload(), organization.editRegistry);
    this.recommendations = createRecommendations?.(() => this.session.inventory);
  }
  onOpen(): void {
    this.openState = true; this.modalEl.addClass("ai-taxonomy-modal"); this.contentEl.addClass("ai-taxonomy");
    this.titleEl.setText(this.organization ? orgText("Organization audit", "Аудит организации") : t("@taxonomy.title"));
    if (this.organization) {
      let stamp = JSON.stringify([this.organization.registry.path, this.organization.registry.definitions]);
      this.stopRegistry = this.organization.registry.subscribe(() => { if (this.openState) {
        const next = JSON.stringify([this.organization!.registry.path, this.organization!.registry.definitions]);
        if (stamp !== next) { stamp = next; this.invalidateInventory(); } this.render();
      } });
    }
    this.session.onChange = () => {
      if (!this.openState) return;
      if (this.session.stage === "scanning" && this.previousStage === "scanning") this.updateStatus();
      else this.render();
    };
    if (this.recommendations) this.recommendations.onChange = () => this.renderRecommendations();
    this.render();
  }
  onClose(): void {
    this.openState = false; this.stopWatching?.(); this.stopRegistry?.(); this.rulesView?.close(); this.decisionOperation?.abort(); this.session.close(); this.recommendations?.close();
    if (this.recommendations?.hasDispatched) new Notice(t("@relationship.cancelScope"));
    this.contentEl.empty(); this.release();
  }
  private invalidateInventory(): void {
    const inventory = this.session.inventory;
    // A dirty snapshot stays dirty; a burst of vault events needs only one UI update.
    if (!inventory || ["stale", "cancelled", "failed"].includes(inventory.state)) return;
    this.session.inventory = { ...inventory, state: "stale", ...(inventory.organization ? { organization: { ...inventory.organization, state: "stale" } } : {}) }; this.recommendations?.invalidate();
    if (this.inventoryEl) this.renderInventory();
  }
  private renderRecommendations(): void {
    if (!this.openState || !this.recommendationEl || !this.recommendations) return;
    if (this.organization && (this.organization.registry.path || this.organizationScope.kind !== "all")) {
      this.recommendationEl.empty(); this.recommendationEl.createEl("p", { text: orgText("AI tag recommendations v1 require the confirmed settings profile and a whole-vault tag inventory. This local audit works independently; registry extensions are not silently sent through the older model contract.", "AI-рекомендациям тегов v1 нужен подтверждённый профиль настроек и инвентарь всего хранилища. Локальный аудит работает отдельно; расширенные правила реестра не передаются через старый контракт модели неявно.") }); return;
    }
    renderTagRecommendationView(this.recommendationEl, this.recommendations, () => {
      new TagNotePicker(this.app, path => { if (this.openState) this.recommendations?.select(path); }).open();
    });
  }
  private updateStatus(): void {
    const s = this.session;
    this.status?.setText(this.organization && s.stage === "editing" && !s.error ? "" : t(s.error ? `@taxonomy.error.${s.error}` : `@taxonomy.stage.${s.stage}`, s.progress));
    this.status?.setAttribute("data-taxonomy-stage", s.stage);
  }
  private button(parent: HTMLElement, key: string, action: () => void, disabled = false): HTMLButtonElement {
    const button = parent.createEl("button", { text: this.organization && key === "analyze" ? orgText("Run local audit", "Запустить локальный аудит") : t(`@taxonomy.${key}`), attr: { type: "button", "data-taxonomy-action": key, "data-taxonomy-focus": key } });
    button.disabled = disabled; button.addEventListener("click", action); return button;
  }
  private field(parent: HTMLElement, label: string, key: string, value: string, change: (value: string) => void, multiline = false): void {
    const id = `${this.identity}-${key}`, row = parent.createDiv({ cls: "ai-taxonomy-field" });
    row.createEl("label", { text: this.organization && label === "exclusions" ? orgText("Exclude paths (one per line, this audit only)", "Исключить пути (по одному на строку, только этот аудит)") : t(`@taxonomy.${label}`), attr: { for: id } });
    const input = multiline ? row.createEl("textarea", { attr: { rows: "2", id } }) : row.createEl("input", { type: "text", attr: { id } });
    input.value = value; input.setAttribute("data-taxonomy-focus", key);
    input.addEventListener("input", () => { change(input.value); this.changed(); });
    input.addEventListener("change", () => { if (this.session.inventory) this.renderInventory(); });
  }
  private select(parent: HTMLElement, key: string, label: string, value: string, options: string[], change: (value: string) => void): void {
    const id = `${this.identity}-${key}`, row = parent.createDiv({ cls: "ai-taxonomy-field" });
    row.createEl("label", { text: this.organization && label === "exclusions" ? orgText("Exclude paths (one per line, this audit only)", "Исключить пути (по одному на строку, только этот аудит)") : t(`@taxonomy.${label}`), attr: { for: id } });
    const select = row.createEl("select", { attr: { id, "data-taxonomy-focus": key } });
    for (const option of options) select.createEl("option", { value: option, text: t(`@taxonomy.${label}.${option}`) });
    select.value = value; select.addEventListener("change", () => { change(select.value); this.changed(); });
  }
  private changed(): void {
    this.session.changed(); this.previousStage = this.session.stage; this.updateStatus();
    const error = this.session.validate(); this.validation?.setText(error ? t(`@taxonomy.error.${error}`) : t(JSON.stringify(this.session.draft) === JSON.stringify(this.session.base) ? "@taxonomy.noChanges" : "@taxonomy.draft"));
    if (this.reviewButton) this.reviewButton.disabled = !!error || JSON.stringify(this.session.draft) === JSON.stringify(this.session.base);
  }
  private render(): void {
    const focus = this.contentEl.ownerDocument.activeElement?.getAttribute("data-taxonomy-focus");
    const s = this.session; this.previousStage = s.stage;
    this.contentEl.empty(); this.reviewButton = undefined; this.validation = undefined; this.inventoryEl = undefined; this.recommendationEl = undefined;
    if (this.organization?.registry.invalidPreferences) {
      this.contentEl.createEl("p", { text: orgText("Organization settings are damaged or unsupported. The original data is retained; rules and decisions are blocked. Restore the organizationAudit section from a verified settings backup before retrying. No fallback profile is active.", "Настройки организации повреждены или не поддерживаются. Исходные данные сохранены; правила и решения заблокированы. Восстановите раздел organizationAudit из проверенной резервной копии настроек. Запасной профиль не активирован."), attr: { role: "alert", "data-org-state": "invalid-settings" } });
      return;
    }
    this.contentEl.createEl("p", { text: this.organization ? orgText("Explore local organization without a model or API key. Nothing changes in your notes. Rules are optional.", "Изучите организацию локально, без модели и API-ключа. Заметки не изменяются. Правила необязательны.") : t("@taxonomy.scope") });
    this.status = this.contentEl.createDiv({ attr: { role: "status", "aria-live": "polite" } }); this.updateStatus();
    if (s.stage === "review" || s.stage === "saving") this.renderReview();
    else {
      const scan = this.contentEl.createEl("fieldset"); scan.createEl("legend", { text: this.organization ? orgText("Area and local audit", "Область и локальный аудит") : t("@taxonomy.inventory") });
      if (this.organization) {
        const label = scan.createEl("label", { text: orgText("Folder including subfolders; empty = whole vault", "Папка с вложенными папками; пусто = всё хранилище") });
        const input = label.createEl("input", { type: "text", attr: { "data-org-field": "scope", "data-taxonomy-focus": "org-scope" } });
        input.value = this.organizationScope.kind === "folder" ? this.organizationScope.path : "";
        input.addEventListener("input", () => { this.organizationScope = input.value ? { kind: "folder", path: input.value } : { kind: "all" }; this.invalidateInventory(); });
        scan.createEl("p", { text: orgText("Only this area and its descendants; existing Health scans remain global.", "Только эта область и вложенные папки; старые проверки Health остаются глобальными.") });
        const exclusionsHelp = scan.createEl("details"); exclusionsHelp.createEl("summary", { text: orgText("Which files are excluded?", "Какие файлы исключаются?") });
        exclusionsHelp.createEl("p", { text: orgText("Hidden/config, template, backup and node_modules folders, linked registries and explicitly marked service files are excluded. List other instruction/prompt paths below.", "Скрытые/служебные папки, шаблоны, резервные копии, node_modules, подключённый реестр и явно помеченные служебные файлы исключены. Другие инструкции и prompt-файлы укажите ниже.") });
        if (this.organization.registry.path) scan.createEl("p", { text: orgText("Registry excluded: ", "Реестр исключён: ") + this.organization.registry.path });
      }
      this.field(scan, "exclusions", "exclusions", this.exclusions, value => { this.exclusions = value; this.invalidateInventory(); }, true);
      this.button(scan, "analyze", () => {
        try {
          const excluded = taxonomyExclusions(this.exclusions);
          if (this.recommendations || this.organization) {
            this.stopWatching ??= watchTaxonomyFreshness(this.app, () => this.invalidateInventory());
            this.recommendations?.invalidate();
          }
          void s.analyze(excluded);
        }
        catch (error) { s.error = error instanceof TaxonomyError ? error.reason : "scan"; s.stage = "error"; this.render(); }
      }, s.busy || this.rulesView?.busy);
      // Keep cancellation outside the disabled fieldset.
      scan.disabled = s.busy || !!this.rulesView?.busy;
      if (s.stage === "scanning") this.button(this.contentEl, "cancel", () => s.cancelScan());
      if (this.organizationError) this.contentEl.createEl("p", { text: this.organizationError, attr: { role: "alert" } });
      if (s.inventory) this.renderInventory();
      if (this.recommendations) { this.recommendationEl = this.contentEl.createEl("section", { cls: "ai-tag-recommendations" }); this.renderRecommendations(); }
      const rules = this.organization ? this.contentEl.createEl("details", { attr: { "data-org-rules": "true" } }) : this.contentEl;
      if (this.organization) {
        const disclosure = rules as HTMLDetailsElement; disclosure.open = this.rulesOpen;
        disclosure.createEl("summary", { text: orgText("Optional confirmed rules", "Необязательные подтверждённые правила") });
        disclosure.addEventListener("toggle", () => { this.rulesOpen = disclosure.open; });
        this.rulesView?.render(rules, s.busy);
      }
      const editor = rules.createEl("fieldset"); editor.disabled = s.busy || !!this.rulesView?.busy || !!this.organization?.registry.path;
      if (this.organization?.registry.path) editor.createEl("p", { text: orgText("Definitions come from the selected file. Editing the settings copy is disabled. Use the registry editor above, or edit the file yourself and read/review it again; disconnection is separate.", "Правила берутся из выбранного файла. Редактирование копии настроек отключено. Используйте редактор реестра выше либо измените файл самостоятельно и перечитайте его; отключение выполняется отдельно.") });
      editor.createEl("legend", { text: t("@taxonomy.rules") });
      editor.createEl("p", { text: t(s.base ? "@taxonomy.confirmed" : "@taxonomy.noProfile") });
      editor.createEl("p", { text: t("@taxonomy.dimensions") });
      for (const category of s.draft.categories) this.renderCategory(editor, category);
      this.button(editor, "add", () => {
        const id = nextCategoryId(s.draft.categories);
        s.draft.categories.push({ id, name: t("@taxonomy.newCategory", { n: s.draft.categories.length + 1 }), ...categoryDefaults("other"), prefixes: [], tags: [] });
        s.changed(); this.render();
      }, s.draft.categories.length >= 64);
      this.validation = editor.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
      const error = s.validate(); this.validation.setText(error ? t(`@taxonomy.error.${error}`) : t(JSON.stringify(s.draft) === JSON.stringify(s.base) ? "@taxonomy.noChanges" : "@taxonomy.draft"));
      this.reviewButton = this.button(editor, "review", () => s.review(), !!error || JSON.stringify(s.draft) === JSON.stringify(s.base));
      this.button(editor, "reload", () => s.reload());
    }
    if (focus) Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-taxonomy-focus]")).find(el => el.getAttribute("data-taxonomy-focus") === focus)?.focus();
  }
  private renderCategory(parent: HTMLElement, category: TaxonomyCategory): void {
    const card = parent.createEl("fieldset", { cls: "ai-semantic-result-card" }); card.createEl("legend", { text: category.name });
    this.field(card, "name", `${category.id}-name`, category.name, value => { category.name = value; });
    this.select(card, `${category.id}-purpose`, "purpose", category.purpose, [...TAXONOMY_PURPOSES], value => { category.purpose = value as TaxonomyCategory["purpose"]; });
    this.select(card, `${category.id}-multiplicity`, "multiplicity", category.multiplicity, ["one_primary", "multiple"], value => { category.multiplicity = value as TaxonomyCategory["multiplicity"]; });
    this.select(card, `${category.id}-interpretation`, "interpretation", category.interpretation, ["global", "domain"], value => { category.interpretation = value as TaxonomyCategory["interpretation"]; });
    const tokens = (value: string) => value.split("\n").map(token => token.trim().replace(/^#/, "")).filter(Boolean);
    this.field(card, "prefixes", `${category.id}-prefixes`, category.prefixes.join("\n"), value => { category.prefixes = tokens(value); }, true);
    this.field(card, "flatTags", `${category.id}-tags`, category.tags.join("\n"), value => { category.tags = tokens(value); }, true);
    this.button(card, "remove", () => { this.session.draft.categories = this.session.draft.categories.filter(item => item !== category); this.session.changed(); this.render(); });
  }
  private decide(work: (signal: AbortSignal) => Promise<void>): void {
    if (this.decisionOperation || !this.openState) return;
    this.decisionOperation = new AbortController(); this.organizationError = "";
    void work(this.decisionOperation.signal).then(() => { if (this.openState) this.renderInventory(); }, () => {
      if (this.openState) { this.organizationError = orgText("Decision not saved. Existing decisions are retained. Check capacity (200), settings or a concurrent change, then explicitly try again.", "Решение не сохранено. Прежние решения остаются. Проверьте лимит 200, настройки или конкурирующее изменение и повторите действие явно."); this.render(); }
    }).finally(() => { this.decisionOperation = undefined; });
  }
  private renderInventory(): void {
    const inventory = this.session.inventory!;
    const section = this.inventoryEl ?? this.contentEl.createEl("section");
    const history = section.querySelector<HTMLDetailsElement>("[data-org-decisions]"); if (history) this.decisionHistoryOpen = history.open;
    this.inventoryEl = section; section.empty();
    if (this.organization && inventory.organization) {
      const paths = new Set(inventory.organization.sources.map(source => source.path));
      const findings = (this.organization.findings ?? []).filter(finding => finding.source === "local" && finding.state === "open" && finding.notePaths.length && finding.notePaths.every(path => paths.has(path)));
      if (findings.length) {
        const previous = section.createEl("details"); previous.createEl("summary", { text: orgText("Earlier local Health observations (not rerun): ", "Прежние локальные наблюдения Health (не перепроверены): ") + findings.length });
        for (const finding of findings.slice(0, 10)) { previous.createEl("p", { text: finding.title + " — " + finding.explanation }); previous.createEl("p", { text: finding.notePaths.slice(0, 5).join(", ") }); }
      }
      renderOrganizationSummary(section, inventory, this.port.get(), this.organization.registry, this.app,
        (state, suggestion) => { if (inventory.organization?.state === "complete") this.decide(signal => this.organization!.registry.decide(suggestion.authority, state, signal)); },
        prefix => { if (this.session.inventory?.organization?.state !== "complete" || this.organization?.registry.path) return;
          this.session.draft.categories.push(...suggestTaxonomy(inventory.tags.filter(row => row.tag.startsWith(prefix + "/")).map(row => row.tag), this.session.draft.categories));
          this.session.changed(); this.rulesOpen = true; this.render(); },
        (authority, legacyId) => this.decide(signal => this.organization!.registry.restoreDecision(authority, signal, legacyId)),
        id => this.decide(signal => this.organization!.registry.restoreLegacy(id, signal)), this.decisionHistoryOpen);
    } else {
    section.createEl("h3", { text: this.organization ? orgText("Area and local audit", "Область и локальный аудит") : t("@taxonomy.inventory") });
    section.createEl("p", { text: t(`@taxonomy.scan.${inventory.state}`), attr: { "data-taxonomy-inventory": inventory.state } });
    section.createEl("p", { text: t("@taxonomy.statistics", { total: inventory.total, processed: inventory.processed, excluded: inventory.excluded,
      unavailable: inventory.unavailable, empty: inventory.empty, unique: inventory.tags.length }) });
    section.createEl("p", { text: t("@taxonomy.cache") });
    }
    if (this.organization?.tagNote) {
      const tag = section.createEl("button", { text: t("@localNote.tag"), attr: { type: "button", "data-org-action": "tag-note" } });
      tag.addEventListener("click", () => this.organization?.tagNote?.(inventory, taxonomyExclusions(this.exclusions)));
    }
    const tree = section.createEl("details"); tree.createEl("summary", { text: t("@taxonomy.tree") });
    let initialized = false;
    tree.addEventListener("toggle", () => { if (tree.open && !initialized) { initialized = true; this.renderTree(tree, ""); } });
    const flat = inventory.tags.filter(item => !item.tag.includes("/"));
    const unassigned = inventory.tags.filter(item => !categoryForTag(item.tag, this.session.draft.categories));
    for (const [key, tags] of [["flat", flat], ["unassigned", unassigned]] as const) {
      const list = section.createEl("details"); list.createEl("summary", { text: `${t(`@taxonomy.${key}`)} (${tags.length})` });
      const ul = list.createEl("ul"); let offset = 0;
      const more = this.button(list, "more", () => append());
      const append = () => { for (const item of tags.slice(offset, offset + 100)) ul.createEl("li", { text: `#${item.tag} — ${item.notes}` }); offset += 100; more.hidden = offset >= tags.length; };
      append();
    }
    const suggestions = !this.organization && inventory.state === "complete" ? suggestTaxonomy(inventory.tags.map(item => item.tag), this.session.draft.categories) : [];
    if (suggestions.length) {
      section.createEl("h3", { text: t("@taxonomy.suggestions") }); section.createEl("p", { text: t("@taxonomy.hypothesis") });
      const list = section.createEl("ul");
      for (const item of suggestions) list.createEl("li", { text: `${item.name} — ${t(`@taxonomy.purpose.${item.purpose}`)}; ${t(`@taxonomy.multiplicity.${item.multiplicity}`)}; ${t(`@taxonomy.interpretation.${item.interpretation}`)}` });
      this.button(section, "useSuggestions", () => { this.session.draft.categories.push(...suggestions); this.session.changed(); this.render(); });
    }
  }
  private renderTree(parent: HTMLElement, prefix: string): void {
    const nodes = new Map<string, { notes: number | null; children: boolean }>();
    for (const item of this.session.inventory!.tags) {
      if (prefix && !item.tag.startsWith(`${prefix}/`)) continue;
      const next = item.tag.slice(prefix ? prefix.length + 1 : 0).split("/")[0], path = prefix ? `${prefix}/${next}` : next;
      const node = nodes.get(path) ?? { notes: null, children: false };
      if (path === item.tag) node.notes = item.notes; else node.children = true;
      nodes.set(path, node);
    }
    const list = parent.createEl("ul", { cls: "ai-taxonomy-tree" }), entries = [...nodes]; let offset = 0;
    const more = this.button(parent, "more", () => append());
    const append = () => {
      for (const [tag, node] of entries.slice(offset, offset + 100)) {
        const li = list.createEl("li"), label = `#${tag} — ${node.notes === null ? t("@taxonomy.virtual") : node.notes}`;
        if (!node.children) li.createSpan({ text: label });
        else {
          const details = li.createEl("details"); details.createEl("summary", { text: label }); let rendered = false;
          details.addEventListener("toggle", () => { if (details.open && !rendered) { rendered = true; this.renderTree(details, tag); } });
        }
      }
      offset += 100; more.hidden = offset >= entries.length;
    }; append();
  }
  private renderReview(): void {
    this.contentEl.createEl("h3", { text: t("@taxonomy.changes") });
    this.contentEl.createEl("p", { text: t("@taxonomy.confirmScope") });
    const before = this.session.base?.categories ?? [], after = this.session.draft.categories;
    const ids = new Set([...before, ...after].map(category => category.id));
    for (const id of ids) {
      const old = before.find(category => category.id === id), next = after.find(category => category.id === id);
      if (JSON.stringify(old) === JSON.stringify(next)) continue;
      const row = this.contentEl.createDiv({ cls: "ai-semantic-result-card" });
      for (const [key, category] of [["before", old], ["after", next]] as const) {
        row.createEl("h4", { text: t(`@taxonomy.${key}`) });
        row.createEl("p", { text: category ? `${category.name}: ${t(`@taxonomy.purpose.${category.purpose}`)}; ${t(`@taxonomy.multiplicity.${category.multiplicity}`)}; ${t(`@taxonomy.interpretation.${category.interpretation}`)}` : t("@taxonomy.absent") });
        if (category) for (const [label, values] of [["prefixes", category.prefixes], ["flatTags", category.tags]] as const) row.createEl("p", { text: `${t(`@taxonomy.${label}`)}: ${values.map(value => `#${value}`).join(", ") || "—"}` });
      }
    }
    this.button(this.contentEl, "save", () => { void this.session.save(); }, this.session.busy);
    this.button(this.contentEl, "back", () => this.session.edit(), this.session.busy);
  }
}
