import { currentLanguage, dateLocale, t } from "../../i18n";
import type { RecallProductSnapshot } from "../../recall/product/types";

/** Display only. Never feeds localized values back into scheduler math. */
export function formatRecallInterval(intervalMs: number): string {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("Invalid Recall interval.");
  const seconds = Math.max(1, Math.round(intervalMs / 1000));
  const unit = (n: number, name: string) => t(`@recall.unit.${name}.${new Intl.PluralRules(currentLanguage()).select(n)}`, { n });
  if (seconds < 60) return unit(seconds, "second");
  if (seconds < 3600) return [unit(Math.floor(seconds / 60), "minute"), seconds % 60 ? unit(seconds % 60, "second") : ""].filter(Boolean).join(" ");
  if (seconds < 86400) return [unit(Math.floor(seconds / 3600), "hour"), Math.floor(seconds % 3600 / 60) ? unit(Math.floor(seconds % 3600 / 60), "minute") : ""].filter(Boolean).join(" ");
  return unit(Math.round(seconds / 86400), "day");
}

export function recallViewModel(snapshot: RecallProductSnapshot) {
  const blocked = ["invalid", "unsupported", "unavailable"].includes(snapshot.loadState);
  const busy = snapshot.refreshing || snapshot.reviewSaving || snapshot.recovering || snapshot.ingesting || snapshot.loadState === "loading";
  const session = snapshot.session;
  const mode = blocked ? snapshot.confirmingRecovery ? "confirm" : "recovery"
    : snapshot.loadState !== "ready" ? "loading" : session ? session.complete ? "complete" : "session"
    : snapshot.firstRun ? "first-run" : snapshot.summary?.active ? "overview" : "empty";
  const status = snapshot.error ? t(`@recall.error.${snapshot.error}`)
    : snapshot.recovering ? t("@recall.recovering") : snapshot.reviewSaving ? t("@recall.saving")
    : snapshot.refreshing ? t("@recall.scanning") : session?.complete ? t("@recall.caught-up")
    : session?.revealed ? t("@recall.answer-revealed") : snapshot.inventoryResult
      ? snapshot.inventoryResult.complete && snapshot.inventoryResult.committed ? t("@recall.found", { n: snapshot.inventoryResult.active })
        : t("@recall.incomplete") : undefined;
  return {
    mode, busy, status, error: Boolean(snapshot.error), title: t("@recall.title"), introduction: t("@recall.introduction"),
    retry: snapshot.loadState === "unavailable", canRecover: snapshot.canRecover,
    recoveryTitle: t(snapshot.loadState === "unavailable" ? "@recall.unavailable" : "@recall.recovery-title"),
    emptyTitle: t(snapshot.inventoryResult?.complete && snapshot.inventoryResult.committed ? "@recall.empty" : "@recall.no-active"),
    start: Boolean(snapshot.summary?.due),
    inventoryEstablished: snapshot.inventoryEstablished,
    stats: snapshot.summary ? [
      { label: t("@recall.due"), value: snapshot.summary.due },
      { label: t("@recall.active"), value: snapshot.summary.active },
      { label: t("@recall.new"), value: snapshot.summary.new },
    ] : [],
    nextDue: snapshot.nextDueAt !== undefined && !snapshot.summary?.due
      ? new Intl.DateTimeFormat(dateLocale(), { dateStyle: "medium", timeStyle: "short" }).format(snapshot.nextDueAt) : undefined,
    session: session ? { ...session, card: session.card ? { ...session.card } : undefined,
      count: t("@recall.reviewed", { n: session.reviewed }),
      previews: session.previews?.map(({ rating, intervalMs }) => ({ rating, label: t(`@recall.rating.${rating}`),
        help: t(`@recall.meaning.${rating}`), interval: formatRecallInterval(intervalMs) })) } : undefined,
  };
}
export type RecallViewModel = ReturnType<typeof recallViewModel>;
