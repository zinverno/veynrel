import type { RecallGenerationOptions } from "../../recall/authoring";
import { t } from "../../i18n";
import type { RecallAuthoringSnapshot } from "../../recall/product/recallAuthoringPort";
import { healthButton } from "./renderHealthHome";

export function recallAuthoringStatus(snapshot: RecallAuthoringSnapshot): string | undefined {
  if (snapshot.state === "generating" || snapshot.state === "ingesting") return t(`@recall.authoring.${snapshot.state}`);
  const result = snapshot.result;
  if (!result) return undefined;
  if (result.status === "error") return t(`@recall.authoring.${result.reason}`);
  if (result.status === "partial") return t(`@recall.authoring.${result.reason === "editor-save-failed" ? "editor-save-failed" : result.needsRecovery ? "recall-blocked" : "recall-update-failed"}`);
  return `${t(result.cardCount === 1 ? "@recall.authoring.created-one" : "@recall.authoring.created", { n: result.cardCount })} ${t("@recall.authoring.ready")}`;
}

export function renderRecallAuthoring(parent: HTMLElement, snapshot: RecallAuthoringSnapshot,
  actions: { configureOptions?: (options: Partial<RecallGenerationOptions>) => void; savePrompt?: (prompt?: string) => void; request: () => void; generate: () => void; cancel: () => void; configure: () => void }): void {
  const busy = snapshot.state === "generating" || snapshot.state === "ingesting";
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-recall-authoring",
    attr: { "aria-label": t("@recall.authoring.title"), "aria-busy": String(busy) } });
  section.createEl("h2", { text: t("@recall.authoring.title"), attr: snapshot.state === "confirming"
    ? { tabindex: "-1", "data-recall-authoring-confirmation": "true" } : {} });
  if (snapshot.sourcePath) section.createEl("p", { text: snapshot.sourcePath, cls: "veynrel-recall-source" });
  if (snapshot.state === "confirming") {
    if (snapshot.options && actions.configureOptions) {
      const options = snapshot.options, form = section.createDiv({ cls: "veynrel-recall-filters" });
      const field = (key: "count" | "tag" | "goal", label: string, choices?: [string, string][]) => {
        const container = form.createEl("label", { text: t(label) });
        const input = choices ? container.createEl("select") : container.createEl("input", { type: "text" });
        input.setAttribute("aria-label", t(label)); input.setAttribute("data-recall-option", key);
        if (choices) for (const [value, text] of choices) input.createEl("option", { value, text });
        input.value = String(options[key]);
        input.addEventListener("change", () => actions.configureOptions?.({ [key]: key === "count" ? Number(input.value) : input.value.replace(/^#/u, "") }));
        return input;
      };
      field("count", "@recall.topics.count", [5, 10, 15].map(n => [String(n), String(n)]));
      const tag = field("tag", "@recall.topics.tag");
      const list = form.createEl("datalist"); list.id = `recall-tags-${++recallTagListId}`; tag.setAttribute("list", list.id);
      for (const value of snapshot.tags ?? []) list.createEl("option", { value });
      field("goal", "@recall.topics.goal", [["", t("@recall.topics.default")], ["remember", t("@recall.topics.remember")], ["explain", t("@recall.topics.explain")], ["apply", t("@recall.topics.apply")]]);
      if (snapshot.selectionLength) section.createEl("p", { text: t("@recall.topics.selection", { n: snapshot.selectionLength }) });
      const details = section.createEl("details"); details.createEl("summary", { text: t("@recall.topics.instructions") });
      const extra = details.createEl("textarea", { attr: { "aria-label": t("@recall.topics.extra"), maxlength: "4000" } });
      extra.value = options.instructions; extra.addEventListener("change", () => actions.configureOptions?.({ instructions: extra.value }));
      if (snapshot.prompt !== undefined && actions.savePrompt) {
        details.createEl("p", { text: t("@recall.topics.prompt-help") });
        const prompt = details.createEl("textarea", { attr: { "aria-label": t("@recall.topics.prompt"), maxlength: "16000" } });
        prompt.value = snapshot.prompt;
        healthButton(details, t("@recall.topics.save-prompt"), () => actions.savePrompt?.(prompt.value), "recall-save-prompt");
        healthButton(details, t("@recall.topics.reset-prompt"), () => actions.savePrompt?.(), "recall-reset-prompt");
      }
    }
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

let recallTagListId = 0;
