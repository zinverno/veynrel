import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { SemanticIntelligenceSnapshot } from "../semanticIntelligencePort";
import { semanticIntelligenceViewModel } from "./semanticIntelligenceViewModel";
import { healthButton } from "./renderHealthHome";

/** Explicit submit hands the query to the existing consent-aware search owner. */
export function renderSearchEntry(parent: HTMLElement, snapshot: SemanticIntelligenceSnapshot | undefined,
  query: { value: string }, search: (query: string) => void, setup: () => void): void {
  const panel = parent.createEl("section", { cls: "veynrel-search-panel" });
  const top = panel.createDiv({ cls: "veynrel-search-top" });
  top.createEl("h2", { text: t("@visual.search-title") });
  top.createEl("small", { text: snapshot ? `${snapshot.vectorCount} · ${t("@overview.vectors")}` : t("@overview.index-unavailable") });
  const ready = snapshot?.state === "ready";
  const form = panel.createEl("form", { cls: "veynrel-search-entry" });
  setIcon(form.createSpan({ attr: { "aria-hidden": "true" } }), "search");
  const input = form.createEl("input", { type: "search", attr: { "aria-label": t("Семантический поисковый запрос"), placeholder: t("@visual.search-placeholder"), "data-health-action": "overview-query" } });
  input.value = query.value;
  input.addEventListener("input", () => { query.value = input.value; });
  const submit = form.createEl("button", { attr: { type: "submit", "data-health-action": "overview-search", "aria-label": t("Найти") } });
  submit.createSpan({ text: t("Найти") }); setIcon(submit.createSpan({ attr: { "aria-hidden": "true" } }), "corner-down-left");
  submit.disabled = !ready;
  form.addEventListener("submit", event => { event.preventDefault(); if (ready && query.value.trim()) search(query.value); else input.focus(); });
  const recipient = snapshot ? [snapshot.providerLabel, snapshot.model].filter(Boolean).join(" · ") : t("@overview.index-unavailable");
  panel.createEl("small", { cls: "veynrel-search-caption", text: t("@visual.search-recipient", { recipient }) });
  if (!ready) {
    panel.createEl("p", { cls: "veynrel-search-status", text: snapshot?.enabled ? semanticIntelligenceViewModel(snapshot).status : t("@overview.search-unavailable"), attr: { role: "status" } });
    healthButton(panel, t("@overview.setup"), setup, "overview-setup");
  }
}
