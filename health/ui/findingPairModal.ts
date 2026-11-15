import { Modal } from "obsidian";
import type { App } from "obsidian";
import { t } from "../../i18n";
import type { Finding } from "../domain/finding";
import { findingPair } from "../services/recommendationService";
import type { PairReviewPort } from "../workbench/workbenchData";
import { findingPresentation } from "./findingPresentation";
import { findingEvidencePresentation } from "./findingEvidencePresentation";

/** Keeps the originating inbox, scope, scroll and filters mounted beneath the pair review. */
export class FindingPairModal extends Modal {
  private disposePair?: () => void;
  constructor(app: App, private readonly finding: Finding, private readonly port: PairReviewPort) { super(app); }
  onOpen(): void {
    this.modalEl.addClass("ai-pair-inspector-modal"); this.titleEl.setText(t("@actions.compare"));
    const paths = findingPair(this.finding);
    if (!paths) return;
    const basis = this.contentEl.createEl("details"); basis.open = true;
    basis.createEl("summary", { text: findingPresentation(this.finding).title });
    for (const fact of findingEvidencePresentation(this.finding).facts) basis.createEl("p", { text: fact });
    basis.createEl("p", { text: t("@actions.pair-scope") });
    this.disposePair = this.port.mount(this.contentEl.createDiv(), paths);
  }
  onClose(): void { this.disposePair?.(); this.disposePair = undefined; this.contentEl.empty(); }
}
