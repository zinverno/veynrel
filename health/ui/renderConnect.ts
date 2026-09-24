import { t } from "../../i18n";
import type { ConnectDraft, ConnectResult, ConnectSnapshot, ConnectSyncConfirmation } from "../connectPort";
import { connectResultMessage, connectViewModel } from "./connectViewModel";
import { healthButton } from "./renderHealthHome";

export type ConnectSetupState = { step: "choose" } | { step: "form"; draft: ConnectDraft; result?: ConnectResult };
interface Actions {
  setup: () => void;
  choose: (mode: ConnectDraft["mode"]) => void;
  edit: (field: "endpoint" | "token", value: string) => void;
  connect: () => void;
  back: () => void;
  check: () => void;
  requestSync: () => void;
  confirmSync: () => void;
  cancelSync: () => void;
  disable: () => void;
  review: () => void;
  discover: () => void;
}

export function renderConnect(parent: HTMLElement, snapshot: ConnectSnapshot, setup: ConnectSetupState | undefined,
  confirmation: ConnectSyncConfirmation | undefined, result: ConnectResult | undefined, actions: Actions): void {
  const model = connectViewModel(snapshot);
  const section = parent.createEl("section", { cls: "veynrel-health-home veynrel-connect", attr: { "aria-busy": String(snapshot.busy) } });
  section.createEl("h1", { text: model.title, attr: { tabindex: "-1", "data-health-heading": "true" } });
  section.createEl("p", { text: t("@connect.description") });
  section.createEl("p", { text: model.status, cls: "veynrel-health-state" });
  const error = connectResultMessage(setup?.step === "form" ? setup.result : result) ?? model.error;
  if (error) section.createEl("p", { text: error, cls: "veynrel-health-status-error" });
  if (setup) {
    section.createEl("h2", { text: t("@connect.setup") });
    section.createEl("p", { text: t("@connect.server-required") });
    const choices = section.createDiv({ cls: "veynrel-connect-choices" });
    for (const mode of ["local", "remote"] as const) {
      const button = healthButton(choices, t(`@connect.${mode}`), () => actions.choose(mode), `connect-mode-${mode}`, snapshot.busy);
      button.setAttribute("aria-pressed", String(setup.step === "form" && setup.draft.mode === mode));
    }
    if (setup.step === "form") {
      const { draft } = setup;
      section.createEl("p", { text: t(draft.mode === "local" ? "@connect.local-disclosure" : "@connect.remote-disclosure") });
      section.createEl("p", { text: t("@connect.automatic") });
      const field = (name: "endpoint" | "token"): void => {
        const wrapper = section.createEl("label", { cls: "veynrel-connect-field" });
        wrapper.createSpan({ text: t(`@connect.${name}`) });
        const input = wrapper.createEl("input", { attr: { type: name === "token" ? "password" : "url", autocomplete: "off",
          spellcheck: "false", required: "", "data-health-action": `connect-field-${name}` } });
        input.value = draft[name]; input.disabled = snapshot.busy;
        input.addEventListener("input", () => actions.edit(name, input.value));
      };
      if (draft.mode === "remote") field("endpoint");
      field("token");
      section.createEl("p", { text: t("@connect.token-description"), cls: "veynrel-health-muted" });
      section.createEl("p", { text: t("@connect.test-disclosure"), cls: "veynrel-health-muted" });
      healthButton(section, t(snapshot.busy ? "@connect.connecting" : "@connect.connect"), actions.connect, "connect-submit", snapshot.busy, true);
    }
    healthButton(section, t("@health.cancel"), actions.back, "connect-back");
    return;
  }

  const connection = section.createEl("section");
  connection.createEl("h2", { text: t("@connect.connection") });
  connection.createEl("p", { text: `${t("@connect.companion")} · ${model.location}` });
  if (model.endpointLabel) connection.createEl("p", { text: model.endpointLabel, cls: "veynrel-connect-endpoint" });
  if (model.lastSuccess) connection.createEl("p", { text: model.lastSuccess, cls: "veynrel-health-muted" });
  const buttons = connection.createDiv({ cls: "veynrel-connect-actions" });
  if (model.configured) healthButton(buttons, t("@connect.check"), actions.check, "connect-check", snapshot.busy);
  healthButton(buttons, t(model.configured ? "@connect.change" : "@connect.setup"), actions.setup, "connect-setup", snapshot.busy);
  if (snapshot.enabled) healthButton(buttons, t("@connect.disable"), actions.disable, "connect-disable", snapshot.operation === "disable");
  connection.createEl("p", { text: t("@connect.disable-disclosure"), cls: "veynrel-health-muted" });

  const mirror = section.createEl("section");
  mirror.createEl("h2", { text: t("@connect.mirror") });
  mirror.createEl("p", { text: model.mirror });
  mirror.createEl("p", { text: t("@connect.automatic") });
  if (!snapshot.semanticReady) {
    mirror.createEl("p", { text: t("@connect.semantic-required") });
    healthButton(mirror, t("@connect.discover"), actions.discover, "connect-discover");
  }
  if (model.configured) healthButton(mirror, t("@connect.sync"), actions.requestSync, "connect-sync", snapshot.busy || Boolean(confirmation));
  if (confirmation) {
    const disclosure = mirror.createEl("section", { cls: "veynrel-connect-confirmation" });
    disclosure.createEl("h3", { text: t("@connect.confirm-title"), attr: { tabindex: "-1", "data-connect-confirmation": "true" } });
    disclosure.createEl("p", { text: confirmation.endpointLabel, cls: "veynrel-connect-endpoint" });
    disclosure.createEl("p", { text: t(confirmation.local ? "@connect.local-disclosure" : "@connect.remote-disclosure") });
    disclosure.createEl("p", { text: t("@connect.data-title") });
    const list = disclosure.createEl("ul");
    for (const field of ["identity", "paths", "markdown", "chunks", "metadata", "embeddings", "descriptor"]) list.createEl("li", { text: t(`@connect.data.${field}`) });
    disclosure.createEl("p", { text: t("@connect.reconcile") });
    const actionsRow = disclosure.createDiv({ cls: "veynrel-connect-actions" });
    healthButton(actionsRow, t("@health.cancel"), actions.cancelSync, "connect-sync-cancel");
    healthButton(actionsRow, t("@connect.confirm"), actions.confirmSync, "connect-sync-confirm", snapshot.busy, true);
  }

  const access = section.createEl("section");
  access.createEl("h2", { text: t("@connect.access") });
  access.createEl("p", { text: t("@connect.protocol") });
  const capabilities = access.createEl("ul", { cls: "veynrel-connect-capabilities" });
  for (const capability of ["read", "search", "propose"]) capabilities.createEl("li", { text: t(`@connect.capability.${capability}`) });
  access.createEl("p", { text: t("@connect.mirror-only") });
  access.createEl("h3", { text: `${t("@connect.direct-writes")} · ${t("@connect.not-allowed")}` });
  access.createEl("p", { text: t("@connect.approval") });
  access.createEl("p", { text: t("@connect.mcp-credential"), cls: "veynrel-health-muted" });
  healthButton(access, t("@connect.review"), actions.review, "connect-review", !model.configured);
}
