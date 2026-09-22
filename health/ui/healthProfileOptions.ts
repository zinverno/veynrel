import { t } from "../../i18n";
import type { VaultProfile } from "../domain/profile";

export const HEALTH_PROFILES: readonly VaultProfile[] = ["learning", "research", "work", "personal", "mixed"];
export function healthProfileName(profile: VaultProfile): string { return t(`@health.profile.${profile}.name`); }

/** The same native buttons and copy serve onboarding and the secondary Home chooser. */
export function renderHealthProfileOptions(parent: HTMLElement, selected: VaultProfile | undefined, disabled: boolean, choose: (profile: VaultProfile) => void): void {
  const options = parent.createDiv({ cls: "veynrel-health-profiles", attr: { role: "group", "aria-label": t("@health.profile.question") } });
  for (const profile of HEALTH_PROFILES) {
    const button = options.createEl("button", { cls: "veynrel-health-profile-option", attr: {
      type: "button", "data-health-action": `profile-${profile}`, "aria-pressed": String(selected === profile),
    } });
    button.disabled = disabled;
    button.createSpan({ text: healthProfileName(profile), cls: "veynrel-health-profile-name" });
    button.createSpan({ text: t(`@health.profile.${profile}.description`), cls: "veynrel-health-muted" });
    if (selected === profile) button.createSpan({ text: `✓ ${t("@health.profile.selected")}`, cls: "veynrel-health-profile-selected" });
    button.addEventListener("click", () => { if (!button.disabled) choose(profile); });
  }
}
