import { Notice } from "obsidian";
import type { Plugin } from "obsidian";
import { t } from "../../i18n";
import { HealthPluginController } from "./healthPluginController";
import { openHealthView, VEYNREL_HEALTH_VIEW_TYPE } from "./openHealthView";
import { VeynrelHealthView } from "../ui/VeynrelHealthView";

export function registerHealth(plugin: Plugin, openTools: () => void): void {
  const controller = new HealthPluginController(plugin.app, plugin.manifest.id);
  plugin.registerView(VEYNREL_HEALTH_VIEW_TYPE, (leaf) => new VeynrelHealthView(leaf, controller, openTools));
  plugin.register(() => controller.dispose());
  let opening: Promise<void> | undefined;
  const open = (): void => {
    opening ??= openHealthView(plugin.app.workspace).catch(() => { new Notice(t("@health.open-failed")); }).finally(() => { opening = undefined; });
  };
  plugin.addRibbonIcon("activity", t("@health.title"), open);
  plugin.addCommand({ id: "veynrel-open-health", name: t("@health.command"), callback: open });
}
