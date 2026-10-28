import { currentLanguage } from "../../i18n";
import { l } from "../messages";
import type { Recipe } from "../recipe";
import type { CommunityCatalog } from "./catalog";
import type { CommunityInstaller } from "./install";
import { CATEGORIES, COMMUNITY_SITE, COMMUNITY_SOURCE, compareVersions, recipePage } from "./schema";
import type { CatalogEntry, CommunityPreview } from "./schema";

function button(root: HTMLElement, text: string, id: string, action: () => void): HTMLButtonElement {
  const b = root.createEl("button", { text, attr: { type: "button", "data-community-action": id } }); b.addEventListener("click", action); return b;
}
import { literal } from "../ui";
export function communityLink(root: HTMLElement, text: string, href: string): void {
  root.createEl("a", { text, href, attr: { target: "_blank", rel: "noopener noreferrer" } });
}
export function categoryName(category: string): string {
  return ({ learning: l("Learning", "Учёба"), work: l("Work", "Работа"), writing: l("Writing", "Тексты"), knowledge: l("Knowledge", "Знания"), daily: l("Daily notes", "Ежедневные заметки") } as Record<string, string>)[category] ?? category;
}
export class CommunityPanel {
  private search = "";
  private category = "all";
  private versions = new Map<string, string>();
  private preview?: CommunityPreview;
  private expected?: Recipe;
  private pending = false;
  private error = "";
  constructor(private readonly catalog: CommunityCatalog, private readonly installer: CommunityInstaller, private readonly renderView: () => void, private readonly openLocal: (r: Recipe) => void) {}
  private run(work: () => Promise<void>): void {
    if (this.pending) return; this.pending = true; this.error = ""; this.renderView();
    void work().catch(() => { this.error = l("Could not verify or save this recipe. Refresh and inspect the source. Local recipes are preserved.", "Не удалось проверить или сохранить сценарий. Обновите каталог и проверьте источник. Локальные сценарии сохранены."); })
      .finally(() => { this.pending = false; this.renderView(); });
  }
  render(root: HTMLElement): void {
    root.addClass("veynrel-community");
    root.createEl("h2", { text: l("Community", "Сообщество") });
    root.createEl("p", { text: l("Online public recipes. Installation does not run a model or read notes. Running later uses your configured model and separate consent.", "Публичные сценарии через интернет. Установка не запускает модель и не читает заметки. Для запуска используются ваша модель и отдельное согласие.") });
    communityLink(root, l("Community website ↗", "Сайт Community ↗"), COMMUNITY_SITE);
    const statusText = {
      idle: l("Open the online catalog explicitly to connect to GitHub.", "Откройте онлайн-каталог, чтобы подключиться к GitHub."),
      loading: l("Loading…", "Загрузка…"), ready: l("Catalog loaded", "Каталог загружен"), empty: l("The catalog is empty.", "Каталог пуст."),
      cached: l("Cached — offline or refresh failed. This catalog may be outdated.", "Cache — нет соединения или обновление не удалось. Каталог может быть устаревшим."),
      offline: l("Offline. No verified cache available.", "Нет соединения. Проверенного cache нет."),
      error: l("Catalog rejected: invalid content or incompatible schema.", "Каталог отклонён: неверное содержимое или несовместимая схема."),
    }[this.catalog.state];
    root.createEl("p", { text: this.pending ? l("Verifying…", "Проверка…") : statusText, attr: { role: "status", "aria-live": "polite" } });
    if (this.catalog.fetchedAt) root.createEl("p", { text: `${l("Fetched", "Получен")}: ${new Date(this.catalog.fetchedAt).toLocaleString()}` });
    if (this.catalog.cacheWarning) root.createEl("p", { text: l("Public cache is damaged or could not be saved. Installed recipes are separate.", "Публичный cache повреждён или не сохранён. Установленные сценарии хранятся отдельно."), attr: { role: "alert" } });
    if (this.error) root.createEl("p", { text: this.error, attr: { role: "alert" } });
    if (this.installer.state === "damaged") root.createEl("p", { text: l("Origin storage needs manual inspection. Installation is blocked; your local library remains available.", "Хранилище происхождения требует ручной проверки. Установка заблокирована; локальная библиотека доступна."), attr: { role: "alert" } });
    button(root, this.catalog.state === "idle" ? l("Open online catalog", "Открыть онлайн-каталог") : l("Refresh", "Обновить"), "refresh", () => this.run(async () => { this.preview = undefined; await this.catalog.refresh(); await this.installer.load(); })).disabled = this.pending || this.catalog.state === "loading";
    if (this.preview) { this.details(root, this.preview); return; }
    if (!this.catalog.catalog) return;
    const label = root.createEl("label", { cls: "veynrel-studio-field", text: l("Search titles, descriptions and tags", "Поиск по названиям, описаниям и тегам") });
    const input = label.createEl("input", { type: "search", attr: { "data-community-field": "search" } }); input.value = this.search;
    const cl = root.createEl("label", { cls: "veynrel-studio-field", text: l("Category", "Категория") }), select = cl.createEl("select", { attr: { "data-community-field": "category" } });
    select.createEl("option", { value: "all", text: l("All categories", "Все категории") });
    for (const c of CATEGORIES) select.createEl("option", { value: c, text: categoryName(c) }); select.value = this.category;
    const list = root.createDiv({ cls: "veynrel-community-list" });
    const draw = () => {
      list.empty(); const lang = currentLanguage(), latest = new Map<string, CatalogEntry>();
      for (const e of this.catalog.catalog!.entries) if (!latest.has(e.id) || compareVersions(e.version, latest.get(e.id)!.version) > 0) latest.set(e.id, e);
      const entries = [...latest.values()].filter(e => (this.category === "all" || e.category === this.category) && `${e.name.en} ${e.name.ru} ${e.description.en} ${e.description.ru} ${e.tags.join(" ")}`.toLocaleLowerCase().includes(this.search.toLocaleLowerCase()));
      if (!entries.length) list.createEl("p", { text: l("No recipes found.", "Сценарии не найдены.") });
      for (const e of entries) {
        const row = list.createEl("article", { cls: "veynrel-community-row" }), installed = this.installer.installed(e.id);
        row.createEl("h3", { text: e.name[lang] }); row.createEl("p", { text: e.description[lang] });
        row.createEl("p", { text: `${categoryName(e.category)} · ${e.author.name} · ${e.version} · ${e.tags.join(", ")}` });
        if (installed) row.createEl("p", { text: `${l("Installed", "Установлен")} ${installed.entry.version}${installed.modified ? l(" · locally modified", " · изменён локально") : ""}${compareVersions(e.version, installed.entry.version) > 0 ? l(" · update available", " · доступно обновление") : ""}` });
        const versions = this.catalog.catalog!.entries.filter(v => v.id === e.id).sort((a, b) => compareVersions(b.version, a.version));
        const vl = row.createEl("label", { text: l("Version ", "Версия ") }), version = vl.createEl("select");
        for (const v of versions) version.createEl("option", { value: v.version, text: v.version });
        version.value = this.versions.get(e.id) ?? versions[0].version; version.addEventListener("change", () => this.versions.set(e.id, version.value));
        button(row, l("Inspect recipe", "Изучить сценарий"), `inspect-${e.id}`, () => this.run(async () => {
          const selected = versions.find(v => v.version === version.value)!;
          this.preview = await this.catalog.preview(selected); this.expected = this.installer.installed(e.id)?.recipe;
        })).disabled = this.pending;
      }
    };
    input.addEventListener("input", () => { this.search = input.value; draw(); }); select.addEventListener("change", () => { this.category = select.value; draw(); }); draw();
  }
  private details(root: HTMLElement, p: CommunityPreview): void {
    const { entry: e, recipe: r } = p, lang = currentLanguage(), installed = this.installer.installed(e.id);
    button(root, l("Back to catalog", "К каталогу"), "back", () => { this.preview = undefined; this.renderView(); }).disabled = this.pending;
    root.createEl("h2", { text: e.name[lang] }); root.createEl("p", { text: e.description[lang] }); root.createEl("p", { text: e.purpose[lang] });
    root.createEl("p", { text: `${e.author.name} · ${e.version} · ${categoryName(e.category)}` });
    const examples = root.createDiv({ cls: "veynrel-studio-examples" });
    for (const [heading, value] of [[l("Before · fictional example", "До · вымышленный пример"), e.examples.input[lang]], [l("After · illustrative example", "После · иллюстрация"), e.examples.output[lang]]]) { const part = examples.createDiv(); part.createEl("h3", { text: heading }); part.createEl("pre", { text: value, cls: "veynrel-studio-literal", attr: { tabindex: "0" } }); }
    literal(root, l("Source and integrity", "Источник и целостность"), `${e.author.name}\n${e.author.url}\n${e.id} · ${e.version}\n${COMMUNITY_SOURCE}\n${e.recipeUrl}\nSHA-256: ${e.sha256}`);
    root.createEl("p", { text: l("HTTPS protects transport. SHA-256 checks agreement with this catalog, not an independent signature. You still trust the catalog owner and must inspect the instructions.", "HTTPS защищает передачу. SHA-256 проверяет соответствие каталогу, а не независимую подпись. Вы доверяете владельцу каталога и должны проверить инструкции.") });
    communityLink(root, l("Public recipe page ↗", "Публичная страница сценария ↗"), recipePage(e));
    literal(root, l("Full model instruction", "Полная инструкция модели"), r.steps[0].prompt);
    literal(root, l("Constraints and known risks", "Ограничения и известные риски"), `${e.limitations[lang]}\n\n${r.constraints.join("\n")}\n${JSON.stringify(r.limits, null, 2)}`);
    literal(root, l("Complete recipe JSON", "Полный JSON сценария"), p.raw);
    if (installed) {
      root.createEl("p", { text: `${l("Installed / selected version", "Установленная / выбранная версия")}: ${installed.entry.version} → ${e.version}` });
      for (const [label, before, after] of [
        [l("Instruction changes", "Изменения инструкции"), installed.recipe.steps, r.steps],
        [l("Constraint changes", "Изменения ограничений"), { constraints: installed.recipe.constraints, limits: installed.recipe.limits, limitations: installed.entry.limitations }, { constraints: r.constraints, limits: r.limits, limitations: e.limitations }],
        [l("Format and operation changes", "Изменения формата и операций"), installed.recipe.output, r.output],
        [l("Parameter changes", "Изменения параметров"), installed.recipe.parameters, r.parameters],
      ] as const) literal(root, label, `${l("Installed", "Установлено")}:\n${JSON.stringify(before, null, 2)}\n\n${l("Selected", "Выбрано")}:\n${JSON.stringify(after, null, 2)}`);
      if (installed.modified) root.createEl("p", { text: l("This recipe was edited locally. Keep a separate copy before updating, or explicitly replace those edits.", "Сценарий изменён локально. Сохраните отдельную копию перед обновлением либо явно замените изменения."), attr: { role: "alert" } });
    }
    root.createEl("p", { text: l("Confirm only after reading the full instructions. Installation grants no permission to run or change notes.", "Подтверждайте после чтения всех инструкций. Установка не разрешает запуск или изменение заметок.") });
    const same = installed && !installed.modified && installed.entry.version === e.version && installed.entry.sha256 === e.sha256;
    if (same) button(root, l("Installed · open local recipe", "Установлен · открыть локально"), "open-local", () => this.openLocal(installed.recipe));
    else {
      const install = (mode: "replace" | "keep-copy") => this.run(async () => { const result = await this.installer.install(p, this.expected, mode); this.openLocal(result); });
      if (installed?.modified) button(root, l("Keep local copy & install this version", "Сохранить локальную копию и установить версию"), "install-copy", () => install("keep-copy")).disabled = this.pending || this.installer.state !== "ready";
      button(root, installed?.modified ? l("Explicitly replace my edits", "Явно заменить мои изменения") : l("Confirm installation · does not run", "Подтвердить установку · без запуска"), "install", () => install("replace")).disabled = this.pending || this.installer.state !== "ready";
    }
  }
}
