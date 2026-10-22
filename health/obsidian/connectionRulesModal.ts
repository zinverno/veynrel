import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import type { ConnectionRuleMode, ConnectionRulesPort, ConnectionRuleSelector } from "../connections/connectionRules";
import { ruleMembership } from "../connections/connectionRules";
import type { WorkbenchTagsPort } from "../workbench/workbenchTags";

export class ConnectionRulesModal extends Modal {
  private mode: ConnectionRuleMode = "within";
  private kind: ConnectionRuleSelector["kind"] = "tag";
  private value = "";
  private busy = false;
  private error = false;
  private closed = false;
  private generation = 0;
  private removers: (() => void)[] = [];
  constructor(app: App, private readonly rules: ConnectionRulesPort, private readonly tags: WorkbenchTagsPort, private readonly paths: readonly string[]) { super(app); }
  onOpen(): void {
    this.setTitle(t("@rules.title"));
    this.contentEl.addClass("veynrel-review", "veynrel-connection-rules");
    this.removers = [this.rules.subscribe(() => this.render()), this.tags.subscribe(() => this.render())];
    void this.rules.load().catch(() => {}).finally(() => { if (!this.closed) this.render(); }); this.render();
  }
  onClose(): void { this.closed = true; this.generation++; this.removers.forEach(r => r()); this.contentEl.empty(); }
  private async change(action: () => Promise<void>, close = false): Promise<void> {
    if (this.closed || this.busy) return;
    this.busy = true; this.error = false; this.render();
    try { await action(); if (close && !this.closed) this.close(); }
    catch { this.error = true; }
    finally { this.busy = false; if (!this.closed) this.render(); }
  }
  private render(): void {
    if (this.closed) return;
    const host = this.contentEl, generation = ++this.generation;
    const focus = host.ownerDocument.activeElement?.getAttribute("data-health-action");
    const current = () => !this.closed && generation === this.generation && !this.busy && this.rules.state === "ready";
    host.empty(); host.createEl("p", { text: t("@rules.scope") });
    if (this.rules.state !== "ready") host.createEl("p", { text: t(this.rules.state === "error" ? "@rules.loadError" : "@rules.loading"), attr: { role: "status" } });
    if (this.error) host.createEl("p", { text: t("@rules.saveError"), attr: { role: "alert" } });
    const select = (label: string, id: string, entries: readonly [string, string][], value: string, changed: (value: string) => void) => {
      const row = host.createDiv({ cls: "veynrel-review-toolbar" });
      row.createEl("label", { text: label, attr: { for: id } });
      const input = row.createEl("select", { attr: { id, "data-health-action": id, "aria-label": label } });
      entries.forEach(([value, text]) => input.createEl("option", { value, text })); input.value = value;
      input.disabled = this.busy || this.rules.state !== "ready";
      input.addEventListener("change", () => { if (current()) { changed(input.value); this.render(); } }); return input;
    };
    select(t("@rules.mode"), "rules-mode", [["within", t("@rules.within")], ["exclude", t("@rules.exclude")]], this.mode, v => { this.mode = v as ConnectionRuleMode; });
    host.createEl("p", { text: t(this.mode === "within" ? "@rules.withinEffect" : "@rules.excludeEffect") });
    select(t("@rules.group"), "rules-kind", [["tag", t("@rules.tag")], ["folder", t("@rules.folder")]], this.kind, v => { this.kind = v as ConnectionRuleSelector["kind"]; this.value = ""; });
    const metadata = this.tags.getSnapshot();
    const options = this.kind === "tag" ? [...new Set(metadata.notes.filter(n => n.state === "known").flatMap(n => [...n.tags]))].sort() :
      [...new Set(this.paths.flatMap(path => { const segments = path.split("/").slice(0, -1); return segments.map((_, i) => segments.slice(0, i + 1).join("/")); }))].sort();
    if (!options.includes(this.value)) this.value = "";
    select(t(this.kind === "tag" ? "@rules.exactTag" : "@rules.descendants"), "rules-target", [["", t("@rules.choose")], ...options.map(v => [v, this.kind === "tag" ? `#${v}` : `${v}/`] as [string, string])], this.value, v => { this.value = v; });
    if (this.value) {
      const rule = { id: "preview", mode: this.mode, enabled: true, selector: { kind: this.kind, value: this.value } };
      const notes = new Map(metadata.notes.map(n => [n.path, n]));
      const states = this.paths.map(path => ruleMembership(rule, path, notes, "known"));
      host.createEl("p", { text: t("@rules.preview", { count: states.filter(v => v === true).length, unknown: states.filter(v => v === undefined).length, total: this.paths.length }), attr: { role: "status", "data-rules-preview": "" } });
    }
    healthButton(host, t("@rules.save"), () => { if (current() && this.value) void this.change(() => this.rules.add(this.mode, { kind: this.kind, value: this.value }), true); }, "rules-save", this.busy || !this.value || this.rules.state !== "ready", true);
    for (const rule of this.rules.list()) {
      const row = host.createDiv({ cls: "veynrel-review-status" });
      row.createEl("p", { text: `${t(`@rules.${rule.mode}`)} · ${rule.selector.kind === "tag" ? "#" : ""}${rule.selector.value}${rule.selector.kind === "folder" ? "/" : ""}` });
      if (rule.selector.kind === "folder" && this.rules.folderState(rule) !== "known") row.createEl("p", { text: t(`@rules.folder.${this.rules.folderState(rule)}`) });
      const label = row.createEl("label"), enabled = label.createEl("input", { type: "checkbox", attr: { "data-rule-id": rule.id, "data-health-action": `rules-enable-${rule.id}` } });
      enabled.checked = rule.enabled; enabled.disabled = this.busy || this.rules.state !== "ready";
      label.createSpan({ text: t("@rules.enabled") }); enabled.addEventListener("change", () => { if (current()) void this.change(() => this.rules.enable(rule.id, enabled.checked)); });
      healthButton(row, t("@rules.delete"), () => { if (current()) void this.change(() => this.rules.remove(rule.id)); }, `rules-delete-${rule.id}`, this.busy || this.rules.state !== "ready");
    }
    healthButton(host, t("@rules.close"), () => this.close(), "rules-close");
    if (focus) Array.from(host.querySelectorAll<HTMLElement>("[data-health-action]")).find(el => el.getAttribute("data-health-action") === focus)?.focus();
  }
}
