import { App, Modal, Notice } from "obsidian";
import { t } from "../i18n";
import type { RelationshipSession } from "./relationshipSession";
import type { SafeApplyService } from "./safeApply";
import { PairReview } from "./pairReview";

/** Legacy entry uses the same pair-review owner as the embedded workbench. */
export class PairInspectorModal extends Modal {
  private review?: PairReview;
  constructor(app: App, private readonly paths: readonly [string, string],
    private readonly createRelationship?: () => RelationshipSession, private readonly release: () => void = () => {}, private readonly safeApply?: SafeApplyService) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("ai-pair-inspector-modal"); this.titleEl.setText(t("@consolidation.title"));
    this.review = new PairReview(this.app, this.contentEl, this.paths, this.createRelationship, this.release, this.safeApply, () => { this.close(); new Notice(t("@decision.saved")); });
    this.review.open();
  }
  onClose(): void { this.review?.close(); this.review = undefined; }
}
