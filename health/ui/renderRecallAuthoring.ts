import { t } from "../../i18n";
import type { RecallAuthoringSnapshot } from "../../recall/product/recallAuthoringPort";
import { healthButton } from "./renderHealthHome";

export function recallAuthoringStatus(snapshot: RecallAuthoringSnapshot): string | undefined {
  if (snapshot.state === "generating" || snapshot.state === "ingesting") return t(`@recall.authoring.${snapshot.state}`);
  const result = snapshot.result;
  if (!result) return undefined;
  if (result.status === "error") return t(`@recall.authoring.${result.reason}`);
  if (result.status === "partial") return t(`@recall.authoring.${result.needsRecovery ? "recall-blocked" : "recall-update-failed"}`);
  return `${t(result.cardCount === 1 ? "@recall.authoring.created-one" : "@recall.authoring.created", { n: result.cardCount })} ${t("@recall.authoring.ready")}`;
}

export function renderRecallAuthoring(parent: HTMLElement, snapshot: RecallAuthoringSnapshot,
  actions: { request: () => void; generate: () => void; cancel: () => void; configure: () => void }): void {
  const busy = snapshot.state === "generating" || snapshot.state === "ingesting";
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-recall-authoring",
    attr: { "aria-label": t("@recall.authoring.title"), "aria-busy": String(busy) } });
  section.createEl("h2", { text: t("@recall.authoring.title"), attr: snapshot.state === "confirming"
    ? { tabindex: "-1", "data-recall-authoring-confirmation": "true" } : {} });
  if (snapshot.sourcePath) section.createEl("p", { text: snapshot.sourcePath, cls: "veynrel-recall-source" });
  if (snapshot.state === "confirming") {
    section.createEl("p", { text: t("@recall.authoring.confirm-read", { n: snapshot.inputLimit }) });
    section.createEl("p", { text: t(snapshot.local ? "@recall.authoring.local" : "@recall.authoring.remote", { provider: snapshot.providerLabel }) });
    section.createEl("p", { text: t("@recall.authoring.confirm-write") });
    const controls = section.createDiv({ cls: "veynrel-recall-actions" });
    healthButton(controls, t("@health.cancel"), actions.cancel, "recall-authoring-cancel");
    healthButton(controls, t("@recall.authoring.generate"), actions.generate, "recall-authoring-generate", false, true);
    return;
  }
  section.createEl("p", { text: t("@recall.authoring.description"), cls: "veynrel-health-muted" });
  if (!snapshot.configured) {
    section.createEl("p", { text: t("@recall.authoring.unconfigured") });
    healthButton(section, t("@recall.authoring.configure"), actions.configure, "recall-authoring-configure");
  } else if (!snapshot.sourcePath) section.createEl("p", { text: t("@recall.authoring.open-note") });
  else healthButton(section, t("@recall.authoring.current"), actions.request, "recall-authoring-create", busy);
}
