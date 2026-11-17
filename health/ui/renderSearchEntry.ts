import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { semanticIntelligenceViewModel } from "./semanticIntelligenceViewModel";
import { healthButton } from "./renderHealthHome";

/** Explicit submit hands the query to the existing consent-aware search owner. */
export function renderSearchEntry(parent: HTMLElement, snapshot: SemanticIntelligenceSnapshot | undefined,
  query: { value: string }, search: (query: string) => void, setup: () => void): void {
  parent.createEl("h2", { text: t("Семантический поиск") });
  const ready = snapshot?.state === "ready";
  parent.createEl("p", { text: t(ready ? "@overview.search-description" : "@overview.search-unavailable"), cls: "veynrel-health-muted" });
  const form = parent.createEl("form", { cls: "veynrel-search-entry" });
  const input = form.createEl("input", { type: "search", attr: { "aria-label": t("Семантический поисковый запрос"), placeholder: t("Введите смысловой запрос"), "data-health-action": "overview-query" } });
  input.value = query.value;
  input.addEventListener("input", () => { query.value = input.value; });
  const submit = form.createEl("button", { text: t("Найти"), cls: "mod-cta", attr: { type: "submit", "data-health-action": "overview-search" } });
  submit.disabled = !ready;
  form.addEventListener("submit", event => { event.preventDefault(); if (ready && query.value.trim()) search(query.value.trim()); else input.focus(); });
  if (!ready && snapshot?.enabled) parent.createEl("p", { text: semanticIntelligenceViewModel(snapshot).status, attr: { role: "status" } });
  if (!ready) healthButton(parent, t("@overview.setup"), setup, "overview-setup");
  parent.createEl("small", { text: t("@overview.search-scope"), cls: "veynrel-health-muted" });
}
