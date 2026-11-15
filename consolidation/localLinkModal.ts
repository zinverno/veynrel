import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";
import { paragraphRanges, requireLinkRange } from "./changePlan";
import type { PlanRange } from "./changePlan";
import { buildLocalLinkPlan } from "./localLinkPlan";
import { readLocalLinkPair } from "./readLocalLinkPair";
import { SafeApplyError } from "./operationJournal";
import type { SafeApplyService } from "./safeApply";
import { SafeApplyModal } from "./safeApplyModal";

/** Explicit local preparation; the existing consent modal owns the only write path. */
export class LocalLinkModal extends Modal {
  private active = false;
  constructor(app: App, private readonly paths: readonly [string, string], private readonly service: SafeApplyService) { super(app); }
  onOpen(): void {
    this.active = true; this.modalEl.addClass("ai-pair-inspector-modal"); this.contentEl.addClass("ai-change-planner", "ai-local-link");
    this.titleEl.setText(t("@localLink.title"));
    this.contentEl.createEl("p", { text: t("@planner.stage.loading"), attr: { role: "status" } });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const read = await readLocalLinkPair(this.app, this.paths);
      if (!this.active) return;
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: t("@localLink.scope") });
      this.contentEl.createEl("p", { text: t("@localLink.limits") });
      const directionLabel = this.contentEl.createEl("label", { text: t("@localLink.direction") });
      const direction = directionLabel.createEl("select", { attr: { "data-local-link": "direction" } });
      direction.createEl("option", { text: t("@localLink.choose"), value: "" });
      this.paths.forEach((path, i) => direction.createEl("option", { text: `${path} → ${this.paths[i === 0 ? 1 : 0]}`, value: String(i) }));
      const selectionRoot = this.contentEl.createDiv();
      direction.addEventListener("change", () => {
        selectionRoot.empty();
        if (direction.value !== "0" && direction.value !== "1") return;
        const side = direction.value === "0" ? 0 : 1;
        const ranges = paragraphRanges(read.pair[side]).filter(range => {
          try { requireLinkRange(read.pair, side, range, read.linktexts[side === 0 ? 1 : 0]); return true; } catch { return false; }
        });
        if (!ranges.length) { selectionRoot.createEl("p", { text: t("@localLink.unavailable"), attr: { role: "status" } }); return; }
        const label = selectionRoot.createEl("label", { text: t("@planner.location") });
        const select = label.createEl("select", { attr: { "data-local-link": "paragraph" } });
        select.createEl("option", { text: t("@localLink.choose"), value: "" });
        ranges.forEach((range, i) => select.createEl("option", { text: `[${range.start}, ${range.end}) ${range.text.slice(0, 90)}`, value: String(i) }));
        const text = selectionRoot.createEl("pre", { cls: "ai-pair-source", attr: { tabindex: "0" } });
        const confirmLabel = selectionRoot.createEl("label", { text: t("@planner.confirmLink") });
        const confirm = confirmLabel.createEl("input", { type: "checkbox", attr: { "data-local-link": "range-confirm" } });
        const review = selectionRoot.createEl("button", { text: t("@safeApply.review"), cls: "mod-cta", attr: { type: "button", "data-local-link": "review" } });
        let range: PlanRange | undefined;
        review.disabled = true; confirm.disabled = true;
        select.addEventListener("change", () => {
          range = select.value === "" ? undefined : ranges[Number(select.value)];
          text.setText(range?.text ?? ""); confirm.checked = false; confirm.disabled = !range; review.disabled = true;
        });
        confirm.addEventListener("change", () => { review.disabled = !range || !confirm.checked; });
        review.addEventListener("click", () => {
          if (!this.active || !range || !confirm.checked || review.disabled) return;
          try {
            const plan = buildLocalLinkPlan(read, side, range, true);
            this.close();
            new SafeApplyModal(this.app, this.service, current => this.service.reviewLocalLink(plan, current), false, undefined, undefined, plan).open();
          } catch { selectionRoot.createEl("p", { text: t("@localLink.unavailable"), attr: { role: "alert" } }); }
        });
      });
      direction.focus();
    } catch (error) {
      if (!this.active) return;
      this.contentEl.empty(); this.contentEl.createEl("p", { text: t(error instanceof SafeApplyError ? `@safeApply.error.${error.reason}` : "@localLink.unavailable"), attr: { role: "alert" } });
    }
  }
  onClose(): void { this.active = false; this.contentEl.empty(); }
}
